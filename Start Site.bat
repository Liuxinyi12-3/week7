@echo off
rem Starts the local web server and opens the Projects page in your browser.
rem Use this instead of double-clicking projects.html so the weather app can work.
start "Portfolio site server" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8643/projects.html"
