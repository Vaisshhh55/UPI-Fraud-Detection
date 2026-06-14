# UPI Fraud Detection System

A full-stack prototype for real-time UPI fraud detection with transaction monitoring, ML-based scoring, and admin alerts.

## Prerequisites

- Node.js 16+
- Python 3.8+
- npm or yarn

## Installation

```bash
# Backend
cd backend
npm install

# Frontend
cd frontend
npm install

# ML Service
cd ml-service
pip install -r requirements.txt
```

## Quick Start

### Run All Services

```bash
Ctrl+Shift+B  # Select "Start All Services"
```

### Run Individually

```bash
# Terminal 1 - ML Service
cd "D:\UPI fraud detection\ml-service"
py -3 -m pip install -r requirements.txt
py -3 app.py

# Terminal 2 - Backend
cd "D:\UPI fraud detection\backend"
npm install
npm start

# Terminal 3 - Frontend
cd "D:\UPI fraud detection\frontend"
npm install
npm run dev



## Project Structure

```
├── backend/          # Node.js/Express API
├── frontend/         # React + Vite UI
├── ml-service/       # Python Flask ML service
└── README.md         # This file
```

## Technology Stack

- **Frontend:** React, Vite, Axios
- **Backend:** Node.js, Express, JWT
- **ML:** Python, Flask, scikit-learn

## License

MIT
