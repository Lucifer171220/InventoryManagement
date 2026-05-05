"""Test script to diagnose API issues"""
import requests
import json

BASE_URL = "http://localhost:8000/api"

def test_health():
    """Test health endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"Health check: {response.status_code}")
        print(response.json())
    except Exception as e:
        print(f"Health check failed: {e}")

def test_login():
    """Test login and get token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": "manager@inventory.local", "password": "ChangeMe123!"},
            timeout=5
        )
        print(f"\nLogin: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Token received: {data.get('access_token')[:20]}...")
            return data.get('access_token')
        else:
            print(f"Response: {response.text}")
    except Exception as e:
        print(f"Login failed: {e}")
    return None

def test_warehouses(token):
    """Test warehouses endpoint"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/warehouses/", headers=headers, timeout=5)
        print(f"\nWarehouses: {response.status_code}")
        if response.status_code == 200:
            print(f"Data: {response.json()}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Warehouses test failed: {e}")

def test_customers(token):
    """Test customers endpoint"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/customers/", headers=headers, timeout=5)
        print(f"\nCustomers: {response.status_code}")
        if response.status_code == 200:
            print(f"Data: {response.json()}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Customers test failed: {e}")

def test_suppliers(token):
    """Test suppliers endpoint"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/suppliers/", headers=headers, timeout=5)
        print(f"\nSuppliers: {response.status_code}")
        if response.status_code == 200:
            print(f"Data: {response.json()}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Suppliers test failed: {e}")

if __name__ == "__main__":
    print("=" * 50)
    print("API Diagnostic Tests")
    print("=" * 50)

    test_health()
    token = test_login()

    if token:
        test_warehouses(token)
        test_customers(token)
        test_suppliers(token)
    else:
        print("\nSkipping authenticated tests - no token available")
