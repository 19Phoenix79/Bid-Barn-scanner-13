# Assuming this represents the new changes to handle CSV file processing in the project
# Code for processing CSV file in Flask

from flask import Flask, request, jsonify
import csv

app = Flask(__name__)

@app.route('/upload-csv', methods=['POST'])
def upload_csv():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename.endswith('.csv'):
        return jsonify({'error': 'File format not supported. Please upload a .csv file.'}), 400

    data = []
    try:
        # Read the uploaded CSV file
        csvfile = file.read().decode('utf-8').splitlines()
        reader = csv.DictReader(csvfile)
        for row in reader:
            data.append(row)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    return jsonify({'message': 'CSV processed successfully', 'data': data}), 200

if __name__ == '__main__':
    app.run(debug=True)