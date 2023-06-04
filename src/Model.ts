import isEqualWith from 'lodash/isEqualWith'
import clone from 'lodash/clone'
import extend from 'lodash/extend'
import isEmpty from 'lodash/isEmpty'
import isEqual from 'lodash/isEqual'
import uniqueId from 'lodash/uniqueId'
import result from 'lodash/result'
import has from 'lodash/has'
import { default as defaultsHelper } from 'lodash/defaults'
import { Events } from './Events'
import IModelAttributes from './interfaces/IModelAttributes'
import type IModel from './interfaces/IModel'

export class Model extends Events implements IModel {
  public attributes: IModelAttributes = {}
  public idAttribute: string = 'id'
  public changed: any = {}
  public validationError: any = null
  public cid: any
  public cidPrefix: string = 'c'
  public collection: any = null
  private _changing: boolean = false
  private _pending: boolean = false
  private _previousAttributes: any = {}

  constructor(attributes: IModelAttributes, options: any) {
    super()
    let attrs: any = attributes || {}
    options || (options = {})
    this.preinitialize.apply(this, arguments)
    this.cid = uniqueId(this.cidPrefix)
    this.attributes = {}
    if (options.collection) this.collection = options.collection
    const defaults = result(this, 'defaults')
    attrs = defaultsHelper(extend({}, defaults, attrs), defaults)
    this.set(attrs, options)
    this.changed = {}
    this.initialize.apply(this, arguments)
  }

  get id() {
    return this.get('id')
  }

  set id(value: any) {
    this.set('id', value)
  }

  public preinitialize() {}

  public initialize() {}

  // Return a copy of the model's `attributes` object.
  public toJSON() {
    return clone(this.attributes)
  }

  public get(key: string) {
    return this.attributes[key]
  }

  public set(key: string, value: any, options?: any) {
    if (key == null) return this;

    // Handle both `"key", value` and `{key: value}` -style arguments.
    let attrs: any = {}
    if (typeof key === 'object') {
      attrs = key
      options = value
    } else {
      attrs[key] = value
    }

    options || (options = {})

    // Run validation.
    if (!this._validate(attrs, options)) return false

    // Extract attributes and options.
    let unset      = options.unset
    let silent     = options.silent
    let changes    = []
    let changing   = this._changing
    this._changing = true

    if (!changing) {
      this._previousAttributes = clone(this.attributes)
      this.changed = {}
    }

    let current = this.attributes
    let changed = this.changed
    let prev    = this._previousAttributes

    // For each `set` attribute, update or delete the current value.
    for (const attr in attrs) {
      value = attrs[attr]
      if (!isEqualWith(current[attr], value)) changes.push(attr)
      if (!isEqualWith(prev[attr], value)) {
        changed[attr] = value
      } else {
        delete changed[attr]
      }
      unset ? delete current[attr] : current[attr] = value
    }

    // Update the `id`.
    if (this.idAttribute in attrs) {
      const prevId = this.id
      this.id = this.get(this.idAttribute)
      this.trigger('changeId', this, prevId, options)
    }

    // Trigger all relevant attribute changes.
    if (!silent) {
      if (changes.length) this._pending = options
      for (let i = 0; i < changes.length; i++) {
        this.trigger('change:' + changes[i], this, current[changes[i]], options)
      }
    }

    // You might be wondering why there's a `while` loop here. Changes can
    // be recursively nested within `"change"` events.
    if (changing) return this
    if (!silent) {
      while (this._pending) {
        options = this._pending
        this._pending = false
        this.trigger('change', this, options)
      }
    }
    this._pending = false
    this._changing = false
    return this
  }

  // Returns `true` if the attribute contains a value that is not null
  // or undefined.
  public has(key: string): boolean {
    return this.get(key) != null
  }

  // Remove an attribute from the model, firing `"change"`. `unset` is a noop
  // if the attribute doesn't exist.
  public unset(attr: any, options: any) {
    return this.set(attr, void 0, extend({}, options, {unset: true}))
  }

  // Clear all attributes on the model, firing `"change"`.
  public clear(options: any) {
    const attrs: any = {}
    for (const key in this.attributes) attrs[key] = void 0
    return this.set(attrs, extend({}, options, {unset: true}))
  }

  // Determine if the model has changed since the last `"change"` event.
  // If you specify an attribute name, determine if that attribute has changed.
  public hasChanged(attr?: any) {
    if (attr == null) return !isEmpty(this.changed)
    return has(this.changed, attr)
  }

  // Return an object containing all the attributes that have changed, or
  // false if there are no changed attributes. Useful for determining what
  // parts of a view need to be updated and/or what attributes need to be
  // persisted to the server. Unset attributes will be set to undefined.
  // You can also pass an attributes object to diff against the model,
  // determining if there *would be* a change.
  public changedAttributes(diff: any) {
    if (!diff) return this.hasChanged() ? clone(this.changed) : false
    const old = this._changing ? this._previousAttributes : this.attributes
    const changed: any = {}
    let hasChanged: boolean = false
    for (const attr in diff) {
      const val = diff[attr]
      if (isEqual(old[attr], val)) continue
      changed[attr] = val
      hasChanged = true
    }
    return hasChanged ? changed : false
  }

  // Get the previous value of an attribute, recorded at the time the last
  // `"change"` event was fired.
  public previous(attr?: string) {
    if (attr == null || !this._previousAttributes) return null
    return this._previousAttributes[attr]
  }

  // Get all of the attributes of the model at the time of the previous
  // `"change"` event.
  public previousAttributes() {
    return clone(this._previousAttributes);
  }

  clone() {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this)
  }

  // Destroy this model on the server if it was already persisted.
  // Optimistically removes the model from its collection, if it has one.
  // If `wait: true` is passed, waits for the server to respond before removal.
  public destroy(options: any) {
    options = options ? clone(options) : {}
    const model = this
    
    model.stopListening()
    model.trigger('destroy', model, model.collection, options)
  }

  public validate(attr: any, options: any): boolean {
    return true
  }

  private _validate(attrs: any, options: any): boolean {
    if (!options.validate || !this.validate) return true
    attrs = extend({}, this.attributes, attrs)
    const error = this.validationError = this.validate(attrs, options) || null
    if (!error) return true
    this.trigger('invalid', this, error, extend(options, {validationError: error}))
    return false
  }
}
