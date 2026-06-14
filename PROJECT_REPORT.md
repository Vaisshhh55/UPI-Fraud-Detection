# UPI Fraud Detection System - Project Report

## 1. Introduction

This repository contains a full-stack prototype for UPI fraud detection. It combines a React frontend, a Node.js/Express backend API, and a Python/Flask machine learning service to simulate real-time transaction monitoring, scoring, and alerting.

The system is designed to demonstrate how an end-to-end fraud detection pipeline can work with transaction input, ML scoring, user authentication, admin monitoring, and fallback service behavior.

## 2. Project Overview

### 2.1 System Components

- `frontend/`: React + Vite user interface for registration, login, transaction submission, alerts, and admin dashboards.
- `backend/`: Node.js + Express API for authentication, transaction management, ML service integration, persistence, and analytics.
- `ml-service/`: Python Flask service that trains and serves a synthetic fraud model.

### 2.2 Technology Stack

- Languages:
  - JavaScript (frontend + backend)
  - Python (machine learning service)
  - HTML/CSS (frontend view layer)
- Frontend:
  - React
  - Vite
  - Axios
- Backend:
  - Node.js
  - Express
  - MongoDB (optional persistence)
  - JSON Web Tokens (JWT)
  - bcryptjs
- ML Service:
  - Flask
  - scikit-learn
  - pandas
  - numpy
  - joblib

## 3. Repository Structure

- `PROJECT_REPORT.md`: this report describing the whole project.
- `README.md`: quick start and service setup instructions.
- `backend/package.json`: backend dependencies and scripts.
- `backend/index.js`: backend API implementation.
- `frontend/package.json`: frontend dependencies and scripts.
- `frontend/src/App.jsx`: main React application.
- `frontend/index.html`: frontend entry HTML.
- `ml-service/app.py`: training and serving the fraud model.
- `ml-service/requirements.txt`: Python package dependencies.

## 4. Installation and Run Instructions

### 4.1 Backend

```powershell
cd backend
npm install
npm run start
```

Environment variables supported in `backend/index.js`:
- `MONGODB_URI`: MongoDB connection string for persistence.
- `MONGODB_DB`: database name (`upiFraud` by default).
- `ML_SERVICE_URL`: URL of the ML service prediction endpoint.
- `ML_SERVICE_HEALTH_URL`: URL of the ML service health endpoint.
- `JWT_SECRET`: secret for signing tokens.
- `PORT`: port for the backend API (default `5000`).

If MongoDB is not configured, the backend automatically uses in-memory storage for users, transactions, and alerts.

### 4.2 Frontend

```powershell
cd frontend
npm install
npm run dev
```

### 4.3 Machine Learning Service

```powershell
cd ml-service
python -m pip install -r requirements.txt
python app.py
```

The ML service runs on `http://localhost:5001` by default and exposes `/predict` and `/health` endpoints.

## 5. Dataset and ML Model

### 5.1 Synthetic Dataset

The fraud model is trained on synthetic data generated in `ml-service/app.py` using `sklearn.datasets.make_classification`.

Feature design:
- `amount`: transaction amount in INR, scaled to a realistic range.
- `frequency`: number of transactions within a time window.
- `location_anomaly`: binary flag for suspicious location activity.
- `time_anomaly`: binary flag for suspicious time activity.

The synthetic dataset contains 1,200 records with a class distribution of roughly 88% legitimate and 12% fraud.

### 5.2 Model Training

The ML service trains a `LogisticRegression` model with the following workflow:
- generate synthetic classification data
- scale training data with `StandardScaler`
- train the model with `max_iter=1000`
- store the scaler and model in memory for prediction requests

### 5.3 Model Output

The `/predict` endpoint returns:
- `features`: the numeric input values
- `fraud`: boolean fraud prediction
- `score`: probability score for the fraud class

## 6. Backend Implementation

### 6.1 Core Behaviors

The backend in `backend/index.js` performs:
- user registration and login
- password hashing with `bcryptjs`
- JWT creation and validation
- transaction submission and fraud scoring
- alert generation for suspicious transactions
- stats, analytics, and export endpoints
- in-memory fallback when MongoDB is unavailable
- ML service health checks and fallback scoring

### 6.2 Authentication and Authorization

- `/api/register`: register new users and return JWT.
- `/api/login`: authenticate users and return JWT.
- `/api/users/me`: get the logged-in user profile.
- Admin-only routes require the user role to be `admin`.

### 6.3 Transaction Flow

- `/api/transactions` (POST): accepts transaction data and computes a fraud prediction.
  - request fields include `amount`, `timestamp`, `location`, `deviceId`, `frequency`, `locationAnomaly`, and `timeAnomaly`.
  - the backend calls the ML service `/predict` endpoint with numeric feature values.
  - if the ML service fails, a local fallback scoring function computes a fraud score.
  - transactions are saved to MongoDB if configured, otherwise saved in memory.

- `/api/transactions` (GET): returns the current user’s recent transactions or all transactions for admin.

- `/api/stats`: returns total transactions, fraud count, and legitimate count for the current user.

- `/api/transactions/export`: produces a CSV export of the user’s transaction history.

### 6.4 Alerting and Monitoring

- Alerts are recorded when a transaction is predicted as fraud.
- `/api/user/alerts`: returns alerts for the current user.
- Admin pages can review user flags and analytics.

### 6.5 Admin Endpoints

- `/api/admin/users`: list all non-admin users with transaction and fraud counts.
- `/api/admin/users/:userId/transactions`: view transactions for a specific user.
- `/api/admin/users/:userId/flag`: flag or unflag a user as suspicious.
- `/api/admin/fraud-analytics`: compute fraud metrics, location fraud counts, and amount bucket analytics.
- `/api/admin/system-health`: report service health, ML status, and overall system metrics.
- `/api/admin/fraud-threshold`: update the configurable fraud threshold used by fallback logic.

### 6.6 ML Fallback Logic

The backend uses a fallback scoring function when the ML service is unreachable.
- amount contributes up to 45%
- frequency contributes up to 25%
- anomaly flags contribute up to 30%
- fraud is marked when the score reaches the current threshold

This preserves system behavior even if the Python service is temporarily offline.

## 7. Frontend Implementation

### 7.1 User Interface

The frontend is implemented in `frontend/src/App.jsx`.
It supports:
- login and registration forms
- transaction input with amount, location, device, frequency, and anomaly toggles
- transaction history display
- fraud alerts list
- user stats display
- CSV export of transactions

### 7.2 Admin Dashboard

Admin users get additional functionality:
- user list with transaction and fraud counts
- ability to flag/unflag users
- view selected user transaction history
- fraud analytics and location breakdowns
- system health and ML service status
- fraud threshold control

### 7.3 Session Management

- Authentication tokens are stored in `localStorage`.
- User session data is persisted across browser reloads.
- The app sets an `Authorization: Bearer <token>` header for authenticated API requests.

### 7.4 API Integration

The frontend calls the backend API via Axios with the base URL `http://localhost:5000`.
It also refreshes admin analytics periodically every 10 seconds while an admin is logged in.

## 8. Example Use Cases

### 8.1 Normal User Flow

1. User registers or logs in.
2. User submits a transaction from the dashboard.
3. Backend sends transaction features to the ML service.
4. The ML service returns fraud prediction and score.
5. Transaction is stored and an alert is created if fraud is detected.
6. User views transaction history and alerts.

### 8.2 Admin Flow

1. Admin logs in.
2. Admin views all users and transaction statistics.
3. Admin examines fraud analytics and location risk.
4. Admin flags suspicious users or adjusts the threshold.
5. Admin checks ML service health and system metrics.

## 9. Results and Practical Observations

The synthetic model performs well on the generated dataset, but real-world fraud detection would require:
- richer transaction features
- real historical UPI data
- more advanced models such as tree ensembles or anomaly detection methods
- robust evaluation on unseen fraud patterns

This prototype demonstrates the end-to-end integration needed for production-ready fraud detection.

## 10. Limitations and Future Work

Current limitations:
- synthetic dataset only, not production data
- simple logistic regression model
- limited feature set
- no secure production authentication or role management
- frontend and backend assume local deployment

Suggested improvements:
- add real UPI data ingestion and feature engineering
- upgrade the ML model to random forest, XGBoost, or neural networks
- add OTP/multi-factor authentication
- separate services into Docker containers
- add persistent MongoDB storage in production
- implement more complete user management and audit logging

## 11. References

- Scikit-learn documentation: https://scikit-learn.org/stable/documentation.html
- Flask documentation: https://flask.palletsprojects.com/
- Express documentation: https://expressjs.com/
- React documentation: https://reactjs.org/docs/getting-started.html
- Vite documentation: https://vitejs.dev/
- JWT authentication: https://jwt.io/

