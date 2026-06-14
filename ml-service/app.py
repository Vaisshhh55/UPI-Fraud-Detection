from flask import Flask, jsonify, request
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.datasets import make_classification
from sklearn.preprocessing import StandardScaler
import numpy as np

app = Flask(__name__)

model = None
scaler = StandardScaler()

FEATURE_NAMES = [
    'amount',
    'frequency',
    'location_anomaly',
    'time_anomaly'
]


def train_synthetic_model():
    global model
    np.random.seed(42)
    features, labels = make_classification(
        n_samples=1200,
        n_features=4,
        n_informative=4,
        n_redundant=0,
        weights=[0.88, 0.12],
        class_sep=1.25,
        random_state=42
    )
    features[:, 0] = np.clip(features[:, 0] * 5000 + 500, 0, 100000)
    features[:, 1] = np.clip(features[:, 1] * 2 + 3, 0, 20)
    features[:, 2] = np.clip(features[:, 2], 0, 1)
    features[:, 3] = np.clip(features[:, 3], 0, 1)

    X_train, X_test, y_train, y_test = train_test_split(
        features, labels, test_size=0.2, random_state=42
    )

    scaler.fit(X_train)
    X_train_scaled = scaler.transform(X_train)

    model = LogisticRegression(max_iter=1000)
    model.fit(X_train_scaled, y_train)
    print('ML model trained on synthetic data')
    return model


@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json(force=True)
    if not data:
        return jsonify({'error': 'Invalid request'}), 400

    try:
        values = [
            float(data.get('amount', 0)),
            float(data.get('frequency', 0)),
            float(data.get('location_anomaly', 0)),
            float(data.get('time_anomaly', 0))
        ]
    except (TypeError, ValueError):
        return jsonify({'error': 'Feature values must be numeric'}), 400

    X = np.array(values).reshape(1, -1)
    X_scaled = scaler.transform(X)
    probability = float(model.predict_proba(X_scaled)[0, 1])
    label = bool(model.predict(X_scaled)[0])

    response = {
        'features': dict(zip(FEATURE_NAMES, values)),
        'fraud': label,
        'score': probability
    }
    return jsonify(response)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    train_synthetic_model()
    app.run(host='0.0.0.0', port=5001, debug=True)
