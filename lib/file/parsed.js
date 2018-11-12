module.exports = class ParsedFile {
  constructor(id) {
    this.styles = []
    this.dynamicStyles = []
    this.exportStats = {
      export: [],
      moduleExports: []
    }
    this.id = id
    this.imports = []
    this.requires = []
    this.dynamicImports = []
    this.scopes = []
    this.includeStatic = []
    this.code = ''
    this.error = null
  }
}