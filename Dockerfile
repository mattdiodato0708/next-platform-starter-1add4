FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV CONFIG_PATH=config.json
ENV PYTHONUNBUFFERED=1

CMD ["python", "main.py"]
