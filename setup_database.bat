@echo off
echo ============================================
echo Laku.ai - Database Setup
echo ============================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Python is not installed or not in PATH
    echo Please install Python from https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Check if pip is installed
pip --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ pip is not installed or not in PATH
    echo Please ensure pip is installed with your Python installation
    pause
    exit /b 1
)

echo.
echo 📦 Installing required Python packages...
pip install python-dotenv psycopg2-binary flask flask-cors google-generativeai
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to install required packages
    pause
    exit /b 1
)

echo.
echo 🔑 Setting up environment variables...

:: Check if .env file exists, if not create one
if not exist ".\.env" (
    echo # Laku.ai Configuration > .env
    echo DB_NAME=lakuaidb >> .env
    echo DB_USER=postgres >> .env
    echo DB_PASSWORD=postgres >> .env
    echo DB_HOST=localhost >> .env
    echo DB_PORT=5432 >> .env
    echo SECRET_KEY=your-secret-key-here-change-me-in-production >> .env
    echo GEMINI_API_KEY=your-gemini-api-key-here >> .env
    
    echo.
    echo ℹ️  Created .env file with default settings
    echo    Please edit the .env file with your database credentials
    echo    and add your Gemini API key before continuing
    echo.
    pause
    exit /b 0
) else (
    echo ℹ️  .env file already exists, using existing configuration
)

echo.
echo 🛠️  Initializing database...
python init_db.py
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to initialize database
    echo Please make sure PostgreSQL is running and the credentials in .env are correct
    pause
    exit /b 1
)

echo.
echo ✅ Database setup completed successfully!
echo.
echo To start the application, run: python app.py
echo.
pause
