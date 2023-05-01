import IModelAttributes from './interfaces/IModelAttributes'

export class Model {
  public attributes: IModelAttributes = {}

  constructor(attributes: IModelAttributes) {
    this.attributes = attributes
  }

  public get(key: string) {
    return this.attributes[key]
  }

  public set(key: string, value: any) {
    if (key === null) return this
    
    return this.attributes[key] = value
  }
}
