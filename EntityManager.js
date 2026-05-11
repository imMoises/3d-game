class EntityManager {

    constructor(){
        this.entidades = []
        this.contador = 0
        this.entidadesXNombre = {}
    }

    _GetName(){
        this.contador++
        return `Entidad_${this.contador}`
    }

    _Get(nombre){
        return this.entidadesXNombre[nombre]
    }

    AgregarEntidad(entidad, nombre){
        if(!nombre){
            nombre = this._GetName()
        }
        this.entidades.push(entidad)
        entidad.SetNombre(nombre)
        entidad.SetParent(this)
        this.entidadesXNombre[nombre] = entidad
    }
}