@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 22.12 o superior desde https://nodejs.org y vuelve a abrir este archivo.
  pause
  exit /b 1
)
set "PIEZAS_INSTALL_DEPS="
if not exist node_modules\vite\bin\vite.js set "PIEZAS_INSTALL_DEPS=1"
if not exist node_modules\@fontsource\poppins\latin-200.css set "PIEZAS_INSTALL_DEPS=1"
if not exist node_modules\@fontsource\montserrat\latin-700.css set "PIEZAS_INSTALL_DEPS=1"
if defined PIEZAS_INSTALL_DEPS (
  echo Instalando dependencias y tipografias...
  call npm ci
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias. Revisa tu conexion.
    pause
    exit /b 1
  )
)
echo Piezas se abrira en tu navegador. Deja esta ventana abierta mientras lo usas.
call npm run dev -- --port 5173 --strictPort --open
if errorlevel 1 (
  echo Si Piezas ya estaba abierto, visita http://127.0.0.1:5173
  pause
)
