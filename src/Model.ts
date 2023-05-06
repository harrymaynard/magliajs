import isEqualWith from 'lodash/isEqualWith'
import clone from 'lodash/clone'
import extend from 'lodash/extend'
import { Events } from './Events'
import IModelAttributes from './interfaces/IModelAttributes'

export class Model extends Events {
  public attributes: IModelAttributes = {}
  public idAttribute: string = 'id'
  public changed: any = {}
  public validationError: any = null
  private _changing: boolean = false
  private _pending: boolean = false
  private _previousAttributes: any = {}

  constructor(attributes: IModelAttributes) {
    super()
    this.attributes = attributes
  }

  get id() {
    return this.get('id')
  }

  set id(value: any) {
    this.set('id', value)
  }

  // Return a copy of the model's `attributes` object.
  public toJSON() {
    // TODO: Return clone of attributes object.
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
    var unset      = options.unset
    var silent     = options.silent
    var changes    = []
    var changing   = this._changing
    this._changing = true

    if (!changing) {
      this._previousAttributes = clone(this.attributes)
      this.changed = {}
    }

    var current = this.attributes
    var changed = this.changed
    var prev    = this._previousAttributes

    // For each `set` attribute, update or delete the current value.
    for (var attr in attrs) {
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
      var prevId = this.id
      this.id = this.get(this.idAttribute)
      this.trigger('changeId', this, prevId, options)
    }

    // Trigger all relevant attribute changes.
    if (!silent) {
      if (changes.length) this._pending = options
      for (var i = 0; i < changes.length; i++) {
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

  public validate(attr: any, options: any): boolean {
    return true
  }

  private _validate(attrs: any, options: any): boolean {
    if (!options.validate || !this.validate) return true
    attrs = extend({}, this.attributes, attrs)
    var error = this.validationError = this.validate(attrs, options) || null
    if (!error) return true
    this.trigger('invalid', this, error, extend(options, {validationError: error}))
    return false
  }
}
