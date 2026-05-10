class Entity{
    constructor(){
        this.nombre = null
        this.parent = null
        this.componentes = []
    }

    SetParent(parent){
        this.parent = parent
    }
    
    SetNombre(nombre){
        this.nombre = nombre
    }

    AddComponente(componente){
        componente.SetParent(this)
        this.componentes[componente.constructor.name] = componente
        componente.Init()
    }
}