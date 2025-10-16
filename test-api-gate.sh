#!/bin/bash

echo "Testing API Gate with enforcement enabled..."

# Set environment variables for testing
export ENFORCE_API_GATE=true
export SERVICE_KEY=test-secret-key-123
export SERVICE_KEY_HEADER=X-Service-Key

echo ""
echo "1. Test health endpoint (should work without key):"
curl -s -w "\nStatus: %{http_code}\n" http://localhost:5000/api/health | jq . 2>/dev/null || cat

echo ""
echo "2. Test products endpoint without key (should fail with 401):"
curl -s -w "\nStatus: %{http_code}\n" http://localhost:5000/api/products | jq . 2>/dev/null || cat

echo ""
echo "3. Test products endpoint with wrong key (should fail with 401):"
curl -s -w "\nStatus: %{http_code}\n" -H "X-Service-Key: wrong-key" http://localhost:5000/api/products | jq . 2>/dev/null || cat

echo ""
echo "4. Test products endpoint with correct key (should work):"
curl -s -w "\nStatus: %{http_code}\n" -H "X-Service-Key: test-secret-key-123" http://localhost:5000/api/products | jq '.[:1]' 2>/dev/null || cat

echo ""
echo "5. Test webhook endpoint (should work without key):"
curl -s -X POST -w "\nStatus: %{http_code}\n" http://localhost:5000/api/webhooks/anet -d '{}' -H "Content-Type: application/json" | jq . 2>/dev/null || cat

echo ""
echo "6. Test OPTIONS request (should work for CORS):"
curl -s -X OPTIONS -w "\nStatus: %{http_code}\n" http://localhost:5000/api/products -v 2>&1 | grep -E "(Status:|< HTTP)"

