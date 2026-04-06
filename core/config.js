import Conf from 'conf'

const store = new Conf({
  projectName: 'devkit',
  schema: {
    projects: {
      type: 'object',
      default: {},
    },
    caddyfilePath: {
      type: 'string',
      default: '',
    },
    mailpitPort: {
      type: 'number',
      default: 8025,
    },
    smtpPort: {
      type: 'number',
      default: 1025,
    },
    serviceVersions: {
      type: 'object',
      default: {
        mysql: '8.0',
        postgres: '16',
        redis: '7',
        mailpit: 'latest',
      },
    },
    runtimeVersions: {
      type: 'object',
      default: {
        php: '8.3',
        node: '20',
        python: '3.12',
        go: '1.22',
      },
    },
  },
})

/** Guarda un proyecto en la config */
export function saveProject(name, data) {
  const projects = store.get('projects')
  projects[name] = { ...data, createdAt: new Date().toISOString() }
  store.set('projects', projects)
}

/** Obtiene un proyecto por nombre */
export function getProject(name) {
  return store.get('projects')?.[name] ?? null
}

/** Obtiene todos los proyectos */
export function getAllProjects() {
  return store.get('projects') ?? {}
}

/** Elimina un proyecto */
export function removeProject(name) {
  const projects = store.get('projects')
  delete projects[name]
  store.set('projects', projects)
}

/** Ruta del archivo de config (útil para debug) */
export function getConfigPath() {
  return store.path
}

/** Obtiene las versiones por defecto de los servicios */
export function getServiceVersions() {
  return store.get('serviceVersions')
}

/** Actualiza una versión por defecto de un servicio */
export function setServiceVersion(service, version) {
  const versions = getServiceVersions()
  versions[service] = version
  store.set('serviceVersions', versions)
}

/** Guarda la configuración de servicios de un proyecto */
export function saveProjectServices(projectName, services) {
  const project = getProject(projectName)
  if (!project) return
  
  project.services = services
  saveProject(projectName, project)
}

/** Obtiene la configuración de servicios de un proyecto */
export function getProjectServices(projectName) {
  const project = getProject(projectName)
  return project?.services ?? {}
}

/** Obtiene las versiones por defecto de los runtimes */
export function getRuntimeVersions() {
  return store.get('runtimeVersions')
}

/** Actualiza una versión por defecto de un runtime */
export function setRuntimeVersion(runtime, version) {
  const versions = getRuntimeVersions()
  versions[runtime] = version
  store.set('runtimeVersions', versions)
}

/** Guarda la configuración de runtimes de un proyecto */
export function saveProjectRuntimes(projectName, runtimes) {
  const project = getProject(projectName)
  if (!project) return
  
  project.runtimes = runtimes
  saveProject(projectName, project)
}

/** Obtiene la configuración de runtimes de un proyecto */
export function getProjectRuntimes(projectName) {
  const project = getProject(projectName)
  return project?.runtimes ?? {}
}

export { store }
