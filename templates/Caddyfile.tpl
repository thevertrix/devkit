# Caddyfile global manejado por devkit

{
	# Opciones globales
	local_certs
	# NO APAGAR ADMIN, Caddy lo necesita para comandos como 'caddy reload'
}

# Importar configuraciones de proyectos individuales
import {{CONFIG_DIR}}/*.caddy
