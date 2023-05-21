import clone from 'lodash/clone'
import extend from 'lodash/extend'
import { Events } from './Events'
import { Model } from './Model'

export class Collection<T extends Model> extends Events {
    // The default model for a collection is just a **Backbone.Model**.
    // This should be overridden in most cases.
    public model: T
    
    public models: Array<T>
    public length: number = 0

    private _byId: any = {}
    private comparator: any

    constructor(models: any, options: any) {
      super()
      options || (options = {});
      this.preinitialize.apply(this, arguments);
      if (options.model) this.model = options.model;
      if (options.comparator !== void 0) this.comparator = options.comparator;
      this._reset();
      this.initialize.apply(this, arguments);
      if (models) this.reset(models, extend({silent: true}, options));
    }

    // preinitialize is an empty function by default. You can override it with a function
    // or object.  preinitialize will run before any instantiation logic is run in the Collection.
    public preinitialize() {}

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    public initialize() {}

    // The JSON representation of a Collection is an array of the
    // models' attributes.
    public toJSON() {
      return this.map((model: T) => model.toJSON())
    }

    // Add a model, or list of models to the set. `models` may be Backbone
    // Models or raw JavaScript objects to be converted to Models, or any
    // combination of the two.
    public add(models: any, options: any) {
      return this.set(models, extend({ merge: false }, options, addOptions))
    }

    // Remove a model, or a list of models from the set.
    public remove(models: any, options: any) {
      options = extend({}, options)
      const singular = !Array.isArray(models)
      models = singular ? [models] : models.slice()
      let removed = this._removeModels(models, options)
      if (!options.silent && removed.length) {
        options.changes = {
          added: [],
          merged: [],
          removed: removed
        }
        this.trigger('update', this, options)
      }
      return singular ? removed[0] : removed
    }

    // Update a collection by `set`-ing a new list of models, adding new ones,
    // removing models that are no longer present, and merging models that
    // already exist in the collection, as necessary. Similar to **Model#set**,
    // the core operation for updating the data contained by the collection.
    public set(models: any, options: any) {
      if (models == null) return

      options = extend({}, setOptions, options)
      if (options.parse && !this._isModel(models)) {
        models = this.parse(models, options) || []
      }

      let singular = !Array.isArray(models)
      models = singular ? [models] : models.slice()

      let at = options.at
      if (at != null) at = +at
      if (at > this.length) at = this.length
      if (at < 0) at += this.length + 1

      let set: Array<any> = []
      let toAdd: Array<any> = []
      let toMerge: Array<any> = []
      let toRemove: Array<any> = []
      let modelMap: any = {}

      let add = options.add
      let merge = options.merge
      let remove = options.remove

      let sort = false
      let sortable = this.comparator && at == null && options.sort !== false
      let sortAttr = typeof this.comparator === 'string' ? this.comparator : null

      // Turn bare objects into model references, and prevent invalid models
      // from being added.
      let model, i
      for (i = 0; i < models.length; i++) {
        model = models[i]

        // If a duplicate is found, prevent it from being added and
        // optionally merge it into the existing model.
        let existing = this.get(model)
        if (existing) {
          if (merge && model !== existing) {
            let attrs = this._isModel(model) ? model.attributes : model
            if (options.parse) attrs = existing.parse(attrs, options)
            existing.set(attrs, options)
            toMerge.push(existing)
            if (sortable && !sort) sort = existing.hasChanged(sortAttr)
          }
          if (!modelMap[existing.cid]) {
            modelMap[existing.cid] = true
            set.push(existing)
          }
          models[i] = existing

        // If this is a new, valid model, push it to the `toAdd` list.
        } else if (add) {
          model = models[i] = this._prepareModel(model, options)
          if (model) {
            toAdd.push(model)
            this._addReference(model, options)
            modelMap[model.cid] = true
            set.push(model)
          }
        }
      }

      // Remove stale models.
      if (remove) {
        for (i = 0; i < this.length; i++) {
          model = this.models[i]
          if (!modelMap[model.cid]) toRemove.push(model)
        }
        if (toRemove.length) this._removeModels(toRemove, options)
      }

      // See if sorting is needed, update `length` and splice in new models.
      let orderChanged = false
      let replace = !sortable && add && remove
      if (set.length && replace) {
        orderChanged = this.length !== set.length || this.models.some(function(m, index) {
          return m !== set[index]
        })
        this.models.length = 0
        splice(this.models, set, 0)
        this.length = this.models.length
      } else if (toAdd.length) {
        if (sortable) sort = true
        splice(this.models, toAdd, at == null ? this.length : at)
        this.length = this.models.length
      }

      // Silently sort the collection if appropriate.
      if (sort) this.sort({silent: true})

      // Unless silenced, it's time to fire all appropriate add/sort/update events.
      if (!options.silent) {
        for (i = 0; i < toAdd.length; i++) {
          if (at != null) options.index = at + i
          model = toAdd[i]
          model.trigger('add', model, this, options)
        }
        if (sort || orderChanged) this.trigger('sort', this, options)
        if (toAdd.length || toRemove.length || toMerge.length) {
          options.changes = {
            added: toAdd,
            removed: toRemove,
            merged: toMerge
          };
          this.trigger('update', this, options)
        }
      }

      // Return the added (or merged) model (or models).
      return singular ? models[0] : models
    }

    // When you have more items than you want to add or remove individually,
    // you can reset the entire set with a new list of models, without firing
    // any granular `add` or `remove` events. Fires `reset` when finished.
    // Useful for bulk operations and optimizations.
    public reset(models: any, options: any) {
      options = options ? clone(options) : {}
      for (let i = 0; i < this.models.length; i++) {
        this._removeReference(this.models[i], options)
      }
      options.previousModels = this.models
      this._reset()
      models = this.add(models, extend({silent: true}, options))
      if (!options.silent) this.trigger('reset', this, options)
      return models
    }

    // Add a model to the end of the collection.
    public push(model: any, options: any) {
      return this.add(model, extend({at: this.length}, options))
    }

    // Remove a model from the end of the collection.
    public pop(options: any) {
      let model = this.at(this.length - 1)
      return this.remove(model, options)
    }

    // Add a model to the beginning of the collection.
    public unshift(model: any, options: any) {
      return this.add(model, extend({at: 0}, options))
    }

    // Remove a model from the beginning of the collection.
    public shift(options: any) {
      let model = this.at(0)
      return this.remove(model, options)
    }

    // Slice out a sub-array of models from the collection.
    public slice() {
      return slice.apply(this.models, arguments)
    }

    // Get a model from the set by id, cid, model object with id or cid
    // properties, or an attributes object that is transformed through modelId.
    public get(obj: any) {
      if (obj == null) return void 0
      return this._byId[obj] ||
        this._byId[this.modelId(this._isModel(obj) ? obj.attributes : obj, obj.idAttribute)] ||
        obj.cid && this._byId[obj.cid]
    }

    // Returns `true` if the model is in the collection.
    public has(obj: any) {
      return this.get(obj) != null
    }

    // Get the model at the given index.
    public at(index: number) {
      if (index < 0) index += this.length
      return this.models[index]
    }

    // Return models with matching attributes. Useful for simple cases of
    // `filter`.
    public where(attrs: any, first: boolean) {
      return this[first ? 'find' : 'filter'](attrs)
    }

    // Return the first model with matching attributes. Useful for simple cases
    // of `find`.
    public findWhere(attrs: any) {
      return this.where(attrs, true)
    }

    // **parse** converts a response into the hash of attributes to be `set` on
    // the model. The default implementation is just to pass the response along.
    public parse(resp: any, options: any) {
      return resp
    }

    // Force the collection to re-sort itself. You don't need to call this under
    // normal circumstances, as the set will maintain sort order as each item
    // is added.
    public sort(options: any) {
      let comparator = this.comparator
      if (!comparator) throw new Error('Cannot sort a set without a comparator')
      options || (options = {})

      let length = comparator.length
      if (typeof comparator === 'function') comparator = comparator.bind(this)

      // Run sort based on type of `comparator`.
      if (length === 1 || typeof comparator === 'string') {
        this.models = this.sortBy(comparator)
      } else {
        this.models.sort(comparator)
      }
      if (!options.silent) this.trigger('sort', this, options)
      return this
    }

    // Pluck an attribute from each model in the collection.
    public pluck(attr: any) {
      return this.map(attr + '')
    }

    // Create a new collection with an identical list of models as this one.
    public clone() {
      return new this.constructor(this.models, {
        model: this.model,
        comparator: this.comparator
      })
    }

    // Define how to uniquely identify models in the collection.
    public modelId(attrs: any, idAttribute: any) {
      return attrs[idAttribute || this.model.prototype.idAttribute || 'id']
    }

    // Get an iterator of all models in this collection.
    public values() {
      return new CollectionIterator(this, ITERATOR_VALUES)
    }

    // Get an iterator of all model IDs in this collection.
    public keys() {
      return new CollectionIterator(this, ITERATOR_KEYS)
    }

    // Get an iterator of all [ID, model] tuples in this collection.
    public entries() {
      return new CollectionIterator(this, ITERATOR_KEYSVALUES)
    }

    [Symbol.iterator](): Function {
      return this.values
    }

    // Private method to reset all internal state. Called when the collection
    // is first initialized or reset.
    private _reset() {
      this.length = 0
      this.models = []
      this._byId  = {}
    }

    // Prepare a hash of attributes (or other model) to be added to this
    // collection.
    private _prepareModel(attrs: any, options: any) {
      if (this._isModel(attrs)) {
        if (!attrs.collection) attrs.collection = this
        return attrs
      }
      options = options ? clone(options) : {}
      options.collection = this

      let model
      if (this.model.prototype) {
        model = new this.model(attrs, options)
      } else {
        // ES class methods didn't have prototype
        model = this.model(attrs, options)
      }

      if (!model.validationError) return model
      this.trigger('invalid', this, model.validationError, options)
      return false
    }

    // Internal method called by both remove and set.
    private _removeModels(models: any, options: any) {
      let removed = []
      for (let i = 0; i < models.length; i++) {
        let model = this.get(models[i])
        if (!model) continue

        let index = this.indexOf(model)
        this.models.splice(index, 1)
        this.length--

        // Remove references before triggering 'remove' event to prevent an
        // infinite loop. #3693
        delete this._byId[model.cid]
        let id = this.modelId(model.attributes, model.idAttribute)
        if (id != null) delete this._byId[id]

        if (!options.silent) {
          options.index = index;
          model.trigger('remove', model, this, options);
        }

        removed.push(model)
        this._removeReference(model, options)
      }
      return removed
    }

    // Method for checking whether an object should be considered a model for
    // the purposes of adding to the collection.
    private _isModel(model) {
      return model instanceof Model
    }

    // Internal method to create a model's ties to a collection.
   private _addReference(model: any, options: any) {
      this._byId[model.cid] = model
      let id = this.modelId(model.attributes, model.idAttribute)
      if (id != null) this._byId[id] = model
      model.on('all', this._onModelEvent, this)
    }

    // Internal method to sever a model's ties to a collection.
    private _removeReference(model: any, options: any) {
      delete this._byId[model.cid]
      let id = this.modelId(model.attributes, model.idAttribute)
      if (id != null) delete this._byId[id]
      if (this === model.collection) delete model.collection
      model.off('all', this._onModelEvent, this)
    }

    // Internal method called every time a model in the set fires an event.
    // Sets need to update their indexes when models change ids. All other
    // events simply proxy through. "add" and "remove" events that originate
    // in other collections are ignored.
    private _onModelEvent(event: any, model: any, collection: any, options: any) {
      if (model) {
        if ((event === 'add' || event === 'remove') && collection !== this) return
        if (event === 'destroy') this.remove(model, options)
        if (event === 'changeId') {
          let prevId = this.modelId(model.previousAttributes(), model.idAttribute)
          let id = this.modelId(model.attributes, model.idAttribute)
          if (prevId != null) delete this._byId[prevId]
          if (id != null) this._byId[id] = model
        }
      }
      this.trigger.apply(this, arguments)
    }
}

// Create a local reference to a common array method we'll want to use later.
let slice = Array.prototype.slice

// Splices `insert` into `array` at index `at`.
const splice = function(array: Array<any>, insert: Array<any>, at: number) {
  at = Math.min(Math.max(at, 0), array.length)
  const tail = Array(array.length - at)
  const length = insert.length
  let i
  for (i = 0; i < tail.length; i++) tail[i] = array[i + at]
  for (i = 0; i < length; i++) array[i + at] = insert[i]
  for (i = 0; i < tail.length; i++) array[i + length + at] = tail[i]
}

// Default options for `Collection#set`.
const setOptions = {
  add: true,
  remove: true,
  merge: true
}
const addOptions = {
  add: true,
  remove: false
}


// CollectionIterator
// ------------------

// A CollectionIterator implements JavaScript's Iterator protocol, allowing the
// use of `for of` loops in modern browsers and interoperation between
// Backbone.Collection and other JavaScript functions and third-party libraries
// which can operate on Iterables.
class CollectionIterator {
  private _collection: any
  private _kind: any
  private _index: any

  constructor(collection: any, kind: any) {
    this._collection = collection
    this._kind = kind
    this._index = 0
  }

  public next() {
    if (this._collection) {
  
      // Only continue iterating if the iterated collection is long enough.
      if (this._index < this._collection.length) {
        let model = this._collection.at(this._index)
        this._index++
  
        // Construct a value depending on what kind of values should be iterated.
        let value
        if (this._kind === ITERATOR_VALUES) {
          value = model
        } else {
          const id = this._collection.modelId(model.attributes, model.idAttribute)
          if (this._kind === ITERATOR_KEYS) {
            value = id
          } else { // ITERATOR_KEYSVALUES
            value = [id, model]
          }
        }
        return {
          value: value,
          done: false
        }
      }
  
      // Once exhausted, remove the reference to the collection so future
      // calls to the next method always return done.
      this._collection = void 0
    }
  
    return {
      value: void 0,
      done: true
    }
  }

  public [Symbol.iterator]() {
    return this
  }
}

// This "enum" defines the three possible kinds of values which can be emitted
// by a CollectionIterator that correspond to the values(), keys() and entries()
// methods on Collection, respectively.
const ITERATOR_VALUES = 1
const ITERATOR_KEYS = 2
const ITERATOR_KEYSVALUES = 3
