#!/bin/bash

echo "🚀 Starting TMS Development Environment..."
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Creating .env from .env.example..."
    cp tms-backend/.env.example .env
    echo "✅ .env file created. Please update it with your configuration."
    echo ""
fi

# Check Docker installation
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Start Redis first
echo "🔴 Starting Redis..."
docker-compose up -d redis
sleep 3

# Start services
echo "🚀 Starting microservices..."
docker-compose up -d auth-service order-service courier-service
sleep 5

echo "🔧 Starting additional services..."
docker-compose up -d route-service notification-service analytics-service vehicle-service location-service
sleep 5

# Start API Gateway
echo "🌐 Starting API Gateway..."
docker-compose up -d api-gateway
sleep 3

# Start Frontend (optional)
read -p "Do you want to start the frontend? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🎨 Starting Frontend..."
    docker-compose up -d frontend
fi

echo ""
echo "✅ TMS Development Environment is starting..."
echo ""
echo "📊 Services Status:"
docker-compose ps

echo ""
echo "🔗 Service URLs:"
echo "   API Gateway:     http://localhost:4000"
echo "   API Docs:        http://localhost:4000/api-docs"
echo "   Frontend:        http://localhost:3000"
echo "   Redis:           localhost:6379"
echo ""
echo "📝 Logs:"
echo "   All services:   docker-compose logs -f"
echo "   Specific:        docker-compose logs -f [service-name]"
echo ""
echo "⏹️  To stop all services: docker-compose down"
echo ""