# UPI Fraud Detection System

A full-stack project that simulates UPI transaction monitoring and detects fraud using a machine learning service.

## Project Structure

- `frontend/` - React/Vite web app for transaction input, dashboard, and alerts
- `backend/` - Node.js / Express API for transaction management, authentication placeholder, and ML service integration
- `ml-service/` - Python Flask service that runs the fraud prediction model

## Run the services

### Backend

```powershell
cd backend
npm install
npm run start
```

Create `backend/.env` from `.env.example` and set `JWT_SECRET` before running if you plan to persist users.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

### ML service

```powershell
cd ml-service
python -m pip install -r requirements.txt
python app.py
```

## Notes

- Set `MONGODB_URI` and `ML_SERVICE_URL` for the backend in `backend/.env` or environment variables.
- The ML service includes a synthetic model training flow for local development.
- This scaffold is a starting point for a full-stack fraud detection application.
