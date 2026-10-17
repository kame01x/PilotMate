import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pilotmate.db")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile")
HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")
HUGGINGFACE_MODEL = os.getenv("HUGGINGFACE_MODEL", "mistralai/Mixtral-8x7B-Instruct-v0.1")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_EXPIRY_MINUTES = int(os.getenv("JWT_EXPIRY_MINUTES", "1440"))
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
AVIOWIKI_API_KEY = os.getenv("AVIOWIKI_API_KEY")

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "")
RATE_LIMIT_AI_REQUESTS = int(os.getenv("RATE_LIMIT_AI_REQUESTS", "50"))
RATE_LIMIT_AI_WINDOW = int(os.getenv("RATE_LIMIT_AI_WINDOW", "3600"))
RATE_LIMIT_AUTH_REQUESTS = int(os.getenv("RATE_LIMIT_AUTH_REQUESTS", "10"))
RATE_LIMIT_AUTH_WINDOW = int(os.getenv("RATE_LIMIT_AUTH_WINDOW", "60"))
