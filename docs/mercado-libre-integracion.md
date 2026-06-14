# Integracion Mercado Libre

## Alcance actual

La integracion actual cubre:

- OAuth para conectar una o varias cuentas de Mercado Libre.
- Guardado local temporal de cuenta conectada.
- Descarga de ventas recientes.
- Normalizacion de ordenes Meli al modelo interno.
- Deteccion de SKUs no mapeados.
- Webhook para recibir notificaciones `orders_v2`.

## Variables necesarias

Configurar en `.env.local`:

```env
APP_URL="http://127.0.0.1:3000"
MELI_CLIENT_ID="..."
MELI_CLIENT_SECRET="..."
MELI_REDIRECT_URI="http://127.0.0.1:3000/api/integrations/meli/callback"
MELI_WEBHOOK_SECRET=""
```

## Endpoints

Conectar cuenta:

```http
GET /api/integrations/meli/connect
```

Listar cuentas conectadas:

```http
GET /api/integrations/meli/accounts
```

Sincronizar ventas recientes:

```http
POST /api/integrations/meli/sync
Content-Type: application/json

{
  "accountId": "meli_123456",
  "limit": 50
}
```

Listar ordenes importadas:

```http
GET /api/integrations/meli/orders
```

Webhook:

```http
POST /api/integrations/meli/webhook
```

## Flujo

1. El cliente entra a `/api/integrations/meli/connect`.
2. Mercado Libre redirige a `/api/integrations/meli/callback`.
3. Se intercambia `code` por tokens.
4. Se consulta `/users/me`.
5. Se guarda la cuenta conectada.
6. El usuario dispara sync manual o llega webhook.
7. Se descargan ordenes recientes con `/orders/search/recent`.
8. Cada orden se normaliza.
9. Si el SKU existe en el catalogo, se identifica SKU maestro y consumo.
10. Si el SKU no existe, queda como no mapeado.

## Pendiente

- Guardar en PostgreSQL en vez de JSON local.
- Aplicar movimientos reales de inventario cuando el SKU este mapeado.
- Descargar detalle de envios con `/shipments/{id}` usando `x-format-new: true`.
- Traer costos financieros mas completos desde pagos/envios/reportes.
- Firmar o validar webhooks si se define secreto operacional.
