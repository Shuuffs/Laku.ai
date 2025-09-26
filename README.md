# Laku.ai - AI-Powered Sales Management System

Laku.ai is a modern, AI-powered sales management system designed to help small businesses track sales, manage inventory, and gain insights through an intuitive web interface.

## Features

- 📊 Real-time sales tracking and analytics
- 🔍 AI-powered sales insights and recommendations
- 📱 Responsive design that works on any device
- 🔐 Simple authentication system
- 🛒 Product and inventory management
- 📈 Sales reports and visualizations

## 🚀 Quick Start

### Prerequisites

- Python 3.8 or higher
- PostgreSQL 12 or higher (running locally or accessible)
- Google Gemini API key (for AI features)

### Windows Setup (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/laku.ai.git
   cd laku.ai
   ```

2. **Run the setup script**
   Double-click on `setup_database.bat` and follow the on-screen instructions.
   
   This will:
   - Install required Python packages
   - Create a `.env` file with default settings
   - Initialize the database

3. **Configure your environment**
   - Open the `.env` file in a text editor
   - Update the database credentials to match your PostgreSQL setup
   - Add your Google Gemini API key

4. **Start the application**
   ```bash
   python app.py
   ```

5. **Access the application**
   Open your browser and go to: http://localhost:5000

### Manual Setup (Alternative)

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/laku.ai.git
   cd laku.ai
   ```

2. **Create and activate a virtual environment**
   ```bash
   python -m venv venv
   .\venv\Scripts\activate  # On Windows
   # OR
   source venv/bin/activate  # On macOS/Linux
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**
   Create a `.env` file in the project root with the following content:
   ```
   DB_NAME=lakuaidb
   DB_USER=your_username
   DB_PASSWORD=your_password
   DB_HOST=localhost
   DB_PORT=5432
   SECRET_KEY=your-secret-key-here
   GEMINI_API_KEY=your-gemini-api-key-here
   ```

5. **Initialize the database**
   ```bash
   python init_db.py
   ```

6. **Start the application**
   ```bash
   python app.py
   ```

## 📚 Documentation

### Database Schema

- **sales**: Stores all sales transactions
- **storage**: Manages product inventory

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_NAME` | PostgreSQL database name | `lakuaidb` |
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | - |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `5432` |
| `SECRET_KEY` | Flask secret key for sessions | - |
| `GEMINI_API_KEY` | Google Gemini API key | - |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
## Project Structure

```
laku.ai/
├── static/           # Static files (CSS, JS, images)
├── templates/        # HTML templates
├── .env             # Environment variables
├── app.py           # Main application file
├── init_db.py       # Database initialization script
├── check_db.py      # Database verification script
├── setup_database.bat # Windows setup script
└── README.md        # This file
```

## API Endpoints

- `GET /` - Main dashboard
- `GET /login` - Login page
- `POST /login` - Process login
- `GET /logout` - Logout user
- `GET /api/sales` - Get sales data (JSON)
- `DELETE /api/sales/<id>` - Delete a sale

## Development

### Running Tests
```bash
pytest
```

### Code Style
This project follows PEP 8 style guide. To check your code:
```bash
flake8 .
```

## Deployment

For production deployment, consider using:
- Gunicorn or uWSGI as the WSGI server
- Nginx as a reverse proxy
- PostgreSQL for the database
- Environment variables for configuration

## Support

For support, please open an issue in the GitHub repository or contact support@laku.ai
