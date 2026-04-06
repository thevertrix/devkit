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

export { store }
