#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "=== Cloudio Local Python Resolver ==="

# Create venv if not exists
if [ ! -d "venv" ]; then
    echo "Creating python virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "Installing / updating dependencies..."
pip install -q -r requirements.txt

echo "Starting resolver server on http://localhost:8000 ..."
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload
