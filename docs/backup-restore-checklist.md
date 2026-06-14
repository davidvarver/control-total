# Backup y restore antes del primer cliente

Fecha: 2026-06-10.

## Por que esto bloquea el piloto

No debemos meter datos de un cliente real grande hasta confirmar que podemos recuperar la base productiva. La app ya marca esto en `/salud#primer-cliente` como `Backup confirmado`.

## Lo que dice DigitalOcean

Segun la documentacion oficial de DigitalOcean Managed Databases:

- Los clusters incluyen backups diarios con point-in-time recovery.
- Para PostgreSQL, los backups corren automaticamente una vez al dia.
- Se retienen por siete dias.
- Restaurar desde backup crea un cluster primario nuevo, no pisa el cluster existente.
- Si destruyes el cluster, tambien destruyes sus backups.

Fuentes:

- https://docs.digitalocean.com/products/databases/
- https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/

## Checklist en DigitalOcean

1. Entrar a DigitalOcean.
2. Ir a `Databases`.
3. Abrir el cluster productivo `control-total-prod`.
4. Confirmar que es PostgreSQL y que es la base usada por Vercel production.
5. Abrir `Backups` o `Actions > Restore from backup`.
6. Confirmar que existen backups recientes.
7. Confirmar que la ventana de restore muestra una opcion reciente o point-in-time.
8. No ejecutar restore sobre produccion. DigitalOcean crea un cluster nuevo para restore.
9. Tomar nota de fecha/hora confirmada.
10. Poner esa fecha en Vercel:

```text
PRODUCTION_BACKUPS_CONFIRMED_AT=2026-06-10
```

## Restore test recomendado

Para estar mas tranquilos antes de un cliente grande:

1. Crear un restore a cluster nuevo desde DigitalOcean.
2. No apuntar Vercel a ese cluster todavia.
3. Comparar conteos basicos contra produccion con:

```powershell
$env:DATABASE_URL="postgresql://PROD..."
$env:RESTORE_DATABASE_URL="postgresql://RESTORE..."
npm run db:verify-restore
```

El script no imprime connection strings ni secretos. Solo muestra conteos y fechas maximas.

Tambien puedes comparar manualmente:

- organizaciones;
- usuarios;
- productos;
- online SKUs;
- ordenes;
- cargos;
- movimientos de inventario.

4. Probar login con una cuenta interna en un entorno separado, no en produccion.
5. Destruir el cluster restaurado solo cuando ya no se necesite.

## Criterio para desbloquear

El bloqueo se considera cerrado cuando:

- Viste backup reciente en DigitalOcean.
- Confirmaste que restore crea un cluster nuevo.
- Hiciste o al menos programaste un restore test.
- Seteaste `PRODUCTION_BACKUPS_CONFIRMED_AT` en Vercel production.
- `/salud#primer-cliente` cambia de `Casi listo` a `Listo`.
