# Guion Converter

Aplicación de escritorio para Windows (Electron) que convierte archivos `.srt` a Excel con formato estructurado de guion.

## Descarga

[![Download](https://img.shields.io/badge/Download-v1.0.0-blue?style=for-the-badge&logo=windows)](https://github.com/DEdgamer1123/Guion-Converter/releases/latest/download/Guion.Converter.Setup.1.0.0.exe)

O ve a [Releases](https://github.com/DEdgamer1123/Guion-Converter/releases) para todas las versiones.

## ¿Qué hace?

- Arrastra o selecciona múltiples archivos `.srt`
- Los ordena automáticamente por número de capítulo (detectado del nombre del archivo)
- Vista previa en tiempo real de los datos
- Exporta un `.xlsx` con dos hojas:
  - **CV**: columnas `Capitulo`, `Nombre`, `Foto` — una fila por capítulo
  - **GUION**: columnas `Capitulo`, `Inicio`, `Fin`, `Personaje`, `Dialogo` — una fila por línea de subtítulo

## Instalación y uso

### Requisitos
- [Node.js](https://nodejs.org/) v18 o superior
- npm

### Pasos

```bash
# 1. Instalar dependencias
npm install

# 2. Instalar Electron (si no está instalado globalmente)
npm install --save-dev electron

# 3. Ejecutar la app
npm start
```

### Construir instalador .exe para Windows

```bash
# Instalar electron-builder
npm install --save-dev electron-builder

# Generar instalador en /dist
npm run build
```

## Nombres de archivos SRT

El capítulo se detecta automáticamente del nombre del archivo. Formatos soportados:

| Nombre de archivo | Capítulo detectado |
|---|---|
| `Serie_EP01_audio.srt` | 1 |
| `Cap03_dialogo.srt` | 3 |
| `capitulo_10.srt` | 10 |
| `S01E05.srt` | 5 |
| `007_subtitulos.srt` | 7 |

## Estructura del proyecto

```
guion-converter/
├── main.js          # Proceso principal Electron (Node.js)
├── preload.js       # Puente seguro entre procesos
├── package.json     # Configuración y dependencias
├── logo.ico         # Ícono de la aplicación
├── src/
│   ├── index.html   # Interfaz principal
│   └── renderer.js  # Lógica del frontend
└── dist/            # Instalador generado (no incluido en el repo)
```

## Licencia

MIT © DEdgamer1123