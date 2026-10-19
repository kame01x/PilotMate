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

# --- Stripe subscriptions (test mode only unless STRIPE_ALLOW_LIVE=true) ---
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
STRIPE_PRICE_ID_MONTHLY = os.getenv("STRIPE_PRICE_ID_MONTHLY")
STRIPE_PRICE_ID_YEARLY = os.getenv("STRIPE_PRICE_ID_YEARLY")
STRIPE_PLAN_MONTHLY_NAME = os.getenv("STRIPE_PLAN_MONTHLY_NAME", "Monthly")
STRIPE_PLAN_YEARLY_NAME = os.getenv("STRIPE_PLAN_YEARLY_NAME", "Yearly")
STRIPE_BILLING_PORTAL_CONFIGURATION_ID = os.getenv("STRIPE_BILLING_PORTAL_CONFIGURATION_ID")
STRIPE_TRIAL_DAYS = int(os.getenv("STRIPE_TRIAL_DAYS", "7"))
STRIPE_ALLOW_LIVE = os.getenv("STRIPE_ALLOW_LIVE", "false").strip().lower() == "true"
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
# on = always require beta entitlement or valid subscription (staging/prod
# default via auto), off = never enforce (local dev), auto = enforce whenever
# ENVIRONMENT != "development". Read dynamically so tests can patch it.
SUBSCRIPTION_ENFORCE = os.getenv("SUBSCRIPTION_ENFORCE", "auto")
