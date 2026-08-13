# Albion Loot Auditor & Analytics

Aplicación de escritorio para Windows (Tauri + React) que captura loot, muertes y trades de Albion Online, concilia el cofre del gremio y publica el balance en Discord.

El **.exe se genera solo en GitHub Actions**. No hace falta instalar Rust ni compilar en tu PC para publicar una versión.

## Qué hace

- Captura UDP Photon (puertos 5055 / 5056 / 5058 / 4535) con Npcap
- Combat loot: quién loteó, de qué cadáver, cantidad, encantamiento y silver estimado
- Muertes, trades y logs de almacenamiento
- Pegar el texto copiado del cofre de Albion y conciliar:
  - 🟢 COMPLETO
  - 🟡 TRANSFERIDO a un oficial
  - 🔴 PENDIENTE / RAT (ítems exactos que faltan)
- Reporte Markdown, webhook de Discord y CSV
- Auto-update nativo de Tauri al abrir la app
- Aviso + botón de instalación si Npcap no está en el PC

## Publicar un instalador (100 % en la nube)

### 1. Sube el repo a GitHub

```
git init
git add .
git commit -m "Initial Albion Loot Auditor"
git remote add origin https://github.com/TU_USUARIO/albion-loot-auditor.git
git push -u origin main
```

En el repo: **Settings → Actions → General → Workflow permissions → Read and write**.

### 2. Una sola vez: claves de auto-update

En cualquier máquina con Node:

```
npx @tauri-apps/cli signer generate -w tauri-updater.key --ci
```

- Copia el contenido de `tauri-updater.key.pub` en `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
- GitHub → Settings → Secrets and variables → Actions:
  - `TAURI_SIGNING_PRIVATE_KEY` = contenido completo de `tauri-updater.key`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = (vacío si no pusiste password)

**Nunca subas `tauri-updater.key` al repo.**

Si este proyecto ya incluye un `pubkey` en `tauri.conf.json`, la clave pública ya está puesta. La clave privada local `tauri-updater.key` **no se sube al git**; hay que cargarla como secret `TAURI_SIGNING_PRIVATE_KEY` en GitHub (este paso se puede hacer con `gh secret set`).

### 3. Disparar el build

Cualquiera de estas acciones en GitHub dispara `.github/workflows/release.yml`:

- Push de un tag `v*` (`v0.1.0`, `v0.2.0`, …)
- Push a la rama `release`
- Botón **Actions → Release → Run workflow**

GitHub Actions:

1. Compila el frontend
2. Compila el instalador NSIS de Windows (`.exe`)
3. Firma los artefactos del updater
4. Publica un GitHub Release con el `.exe`, `.sig` y `latest.json`

Los usuarios que ya tienen la app instalada reciben la actualización **solos** al abrirla.

Para una nueva versión: sube `version` en `src-tauri/tauri.conf.json` y `package.json`, haz push y crea el tag `vX.Y.Z`.

## Instalación en el PC del oficial

1. Descarga `Albion Loot Auditor_x.y.z_x64-setup.exe` desde Releases
2. Si la app lo pide, instala [Npcap](https://npcap.com/#download) marcando **WinPcap API compatible mode**
3. Abre Albion Online y luego el Auditor
4. En **Ajustes**, pega el webhook de Discord y la lista de oficiales

Si Windows bloquea el instalador (SmartScreen), usa “Más información → Ejecutar de todos modos” hasta que firmes el exe con un certificado Authenticode (opcional).

## Desarrollo local (opcional)

Solo si quieres cambiar la UI o el sniffer:

- Node 20+
- Rust stable
- Npcap (para probar captura)

```
npm install
npm run tauri dev
```

Hay un botón **Demo ZvZ** para recorrer auditoría y Discord sin estar en el juego.

## Arquitectura

```
src/                  React + Tailwind (UI oscura)
src-tauri/src/
  npcap.rs            Detecta wpcap.dll e instala Npcap
  capture.rs          Carga Npcap en runtime (sin SDK en CI)
  photon.rs           Envelope Photon + Protocol16/18
  albion.rs           Loot / death / trade / chest heuristics
  prices.rs           Precios vía albion-online-data.com
.github/workflows/release.yml
```

Los códigos numéricos de Albion cambian con cada parche. El decoder combina firmas de parámetros (las mismas que usan los loot loggers públicos) y códigos configurables, para no romperse en el primer hotfix.
