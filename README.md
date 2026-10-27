# ROA Finance

Aplicación web progresiva (PWA) de finanzas personales para ingresos semanales variables (trabajo de delivery). Cada viernes respondes una pregunta: **¿cuánto cobraste esta semana?** y ROA calcula de forma determinista cuánto apartar para facturas, gasolina, gastos personales, deudas, emergencias e inversiones.

- 100 % local: los datos se guardan en **IndexedDB** del dispositivo (nunca en `localStorage`).
- Funciona **sin conexión** una vez cargada e **instalable en iPhone** desde Safari.
- Sin cuentas, sin servidores, sin claves API, sin servicios de pago.
- Se desarrolla y compila en **Windows** (no necesitas Mac ni Xcode).

---

## Stack

React 18 + TypeScript · Vite 6 · Tailwind CSS 3 · componentes shadcn/ui (Radix) · Lucide · Recharts · Dexie.js (IndexedDB) · decimal.js · vite-plugin-pwa (Workbox) · React Router · Vitest.

## Instrucciones para Windows

### 1. Instalar dependencias

1. Instala **Node.js 20 LTS o superior** desde <https://nodejs.org> (instalador `.msi`, opciones por defecto).
2. Instala **Git** desde <https://git-scm.com/download/win>.
3. Abre **PowerShell** y ejecuta:

```powershell
git clone https://github.com/KurokDevs/ROA.git
cd ROA
npm install
```

### 2. Ejecutar en local

```powershell
npm run dev
```

Abre <http://localhost:5173>. Para probarlo desde tu iPhone en la misma red Wi-Fi: `npm run dev -- --host` y abre en Safari la dirección `http://IP-DE-TU-PC:5173` que muestra la consola (el modo offline/instalación solo funciona con HTTPS, es decir, una vez publicado).

Pruebas automáticas:

```powershell
npm test
```

### 3. Compilar para producción

```powershell
npm run build
npm run preview   # sirve la versión compilada en http://localhost:4173
```

El resultado queda en la carpeta `dist/`.

### 4. Publicar en Netlify (gratis)

**Opción A — desde GitHub (recomendada, se actualiza sola):**

1. Entra en <https://app.netlify.com> y crea una cuenta (puedes usar GitHub).
2. **Add new site → Import an existing project → GitHub** y elige el repositorio `ROA`.
3. Netlify lee `netlify.toml`: comando `npm run build`, carpeta `dist`. Pulsa **Deploy**.
4. Obtendrás una URL `https://algo.netlify.app` (con HTTPS, necesario para la PWA).

**Opción B — arrastrar y soltar:** ejecuta `npm run build` y arrastra la carpeta `dist` a <https://app.netlify.com/drop>.

**Vercel:** importa el repositorio en <https://vercel.com/new>; el framework «Vite» se detecta solo y `vercel.json` ya incluye las reglas de rutas.

### 5. Instalar en iPhone desde Safari

1. Abre la URL publicada en **Safari** (no Chrome).
2. Toca el botón **Compartir** (cuadrado con flecha).
3. Elige **Añadir a pantalla de inicio** → **Añadir**.
4. Abre ROA Finance desde el icono: se abre a pantalla completa (standalone) y funciona sin conexión.

> La app instalada tiene un almacenamiento distinto al de la pestaña de Safari. Si ya registraste datos en Safari, exporta una copia en **Ajustes → Exportar copia** e impórtala en la app instalada.

---

## Tus datos (importante)

- Se guardan **solo en el dispositivo y navegador** donde los introduces. **No se sincronizan automáticamente** entre tu iPhone y tu PC.
- Para pasar datos o protegerte de pérdidas: **Ajustes → Exportar copia (JSON)** y luego **Importar copia** en el otro dispositivo. Guarda las copias en Archivos / iCloud Drive.
- **Ajustes → Movimientos (CSV)** exporta las transacciones para Excel o Google Sheets.
- Si borras los datos de Safari o eliminas la app de la pantalla de inicio, los datos locales se pierden.

## Cómo funciona el organizador semanal

Cálculo determinista y comprobable (`src/engine/allocation.ts`), sin IA ni aleatoriedad. Orden estricto de prioridades; un nivel solo recibe dinero si todos los anteriores quedaron cubiertos:

1. **Esenciales** — alquiler, teléfono, seguro, electricidad…
2. **Trabajo y vehículo** — gasolina y mantenimiento del carro.
3. **Pagos pendientes** — deudas y adelantos (pago semanal pactado o el saldo completo si vence esa semana).
4. **Vida diaria** — personal, pareja, suscripciones que siguen cobrando.
5. **Ahorro** — fondo de emergencia, fondo del carro, objetivos.
6. **Inversión** — solo en modo Crecimiento.

**Modos automáticos**

| Modo | Condición | Qué hace |
|---|---|---|
| Supervivencia | El ingreso no cubre las obligaciones (1–4) | Protege lo esencial en orden y muestra el déficit. Nada a ahorro ni inversión. |
| Estabilidad | Obligaciones cubiertas, reservas mínimas incompletas | Aportaciones de ahorro + 50 % del excedente para reforzar reservas (configurable). |
| Crecimiento | Obligaciones y reservas mínimas cubiertas (fondo de emergencia ≥ $500) | 50 % del excedente se propone para inversión (configurable). |

**Cómo calcula cada sobre**

- **Factura con día de vencimiento:** lo que falta ÷ viernes restantes hasta el vencimiento. Un mes de cinco viernes reparte entre 5 ($80 de alquiler) y uno de cuatro entre 4 ($100); el sobre llega exacto. Si ya está cubierta (pago anticipado), pide $0.
- **Factura sin fecha:** la reserva semanal de referencia, con tope en el importe de la factura (así un mes de 5 viernes no acumula de más).
- **Presupuesto semanal (gasolina, personal, pareja):** rellena hasta la cantidad semanal teniendo en cuenta lo que sobró.
- **Ahorro:** aportación semanal hasta alcanzar el objetivo.

Ejemplos con la configuración inicial: $400 → Supervivencia (déficit de $34.01); $500 → Estabilidad con $2.99 libres; $800 → Estabilidad con $152.99 libres; $1,100 → Estabilidad, y Crecimiento (≈ $303 para invertir) cuando el fondo de emergencia supera $500.

Antes de confirmar puedes **editar cualquier importe**. Al confirmar se guarda de forma atómica (ingreso + reservas en sobres + presupuesto) con una **clave única por semana**, así un doble toque o un segundo intento nunca duplican. Después, en «Transferencias en tu banco», marcas qué reservas moviste realmente: el plan y la transferencia ejecutada son cosas distintas.

**Apartar ≠ pagar:** confirmar el presupuesto aparta dinero en el sobre; pagar la factura (Sobres → Pagar factura) es un gasto que descuenta el sobre y avanza el vencimiento al mes siguiente.

### Configuración inicial (editable)

| Concepto | Costo real | Reserva semanal |
|---|---|---|
| Alquiler | $400/mes | $100 |
| Teléfono | $120/mes | $30 |
| Seguro del carro | $120/mes | $30 |
| Gasolina | $150/semana | $150 |
| Personal | $50/semana | $50 |
| Pareja | $50/semana | $50 |
| **Total** | | **$410** |

ROA añade además dos sobres sugeridos, editables o archivables: **Mantenimiento del carro** ($10/semana hasta $300) y **Suscripciones** (equivalente semanal de las que siguen cobrando: ~$14). Las facturas empiezan sin día de vencimiento; añádelo en Sobres para activar el cálculo por viernes restantes.

Suscripciones iniciales **pendientes de cancelación** (nunca se cancelan solas): RuneScape/Jagex $16.23, Crunch Fitness $34.46, Google One $9.99 (se asumieron mensuales; edítalas si no lo son) y Tinder $20.24 (frecuencia sin verificar, excluida de los ahorros estimados).

Metas iniciales: Fondo inmediato $500 · Reserva de emergencia $2,000 · Fondo del carro $1,000 · Patrimonio $5,000 · Patrimonio $10,000.

## Precisión y seguridad

- Todos los importes se guardan como **centavos enteros** y los porcentajes, divisiones y conversiones se calculan con **decimal.js** (sin errores de coma flotante).
- **Patrimonio = efectivo en cuentas + valor de inversiones − deudas.** Los sobres son una subdivisión del efectivo y no se suman de nuevo.
- Las **transferencias internas**, aportaciones, adelantos y pagos de capital de deudas no cuentan como ingreso ni gasto.
- **Trabajo y millas:** las millas recorridas y los gastos del trabajo se registran aparte.
- **Inversiones:** seguimiento manual, sin operaciones reales ni promesas de rendimiento. Las simulaciones se marcan como hipotéticas.

## Estructura del proyecto

```
src/
  lib/          money.ts (decimal), dates.ts (semanas, viernes, meses), utils
  models/       types.ts — modelos TypeScript
  engine/       cálculo puro y testeado: allocation, ledger, goals, subscriptions,
                investments, simulation, stats
  db/           Dexie (IndexedDB): esquema y datos iniciales
  data/         seed.ts — configuración inicial
  services/     operaciones atómicas: budgetService, transactionService,
                envelopeService, crudService, backupService, sync (punto de extensión)
  hooks/        useFinance (lectura reactiva), useTheme
  components/   ui/ (shadcn), common/, forms/, layout/
  pages/        Inicio, Mi Semana, Movimientos, Metas, Ajustes, Sobres,
                Suscripciones, Deudas, Trabajo y millas, Inversiones, Estadísticas
tests/          Vitest (motor + servicios con IndexedDB simulada)
```

### Añadir Supabase más adelante

La UI nunca habla con la base de datos directamente para escribir: usa `src/services/*`, y el cálculo vive en `src/engine/*` (funciones puras). Para sincronizar entre dispositivos basta con implementar la interfaz `SyncAdapter` de `src/services/sync.ts` (por ejemplo, subir/bajar la instantánea de `exportBackup` a una tabla de Supabase con autenticación) o sustituir los servicios por versiones que escriban en Supabase y repliquen en Dexie.

## Pruebas

`npm test` ejecuta 65 pruebas: semanas de $400/$500/$600/$800/$1,100, déficit, facturas mensuales y meses de cinco viernes, pagos anticipados, adelantos y devoluciones, transferencias internas, cancelación de suscripciones, migración de datos, semanas que cruzan meses y años, edición de registros históricos, prevención de duplicados (incluido el doble toque), copias de seguridad y CSV.

Iconos: `node scripts/generate-icons.mjs` regenera los PNG desde `public/favicon.svg` (requiere Playwright).
