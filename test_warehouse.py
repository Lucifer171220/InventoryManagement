import urllib.request

req = urllib.request.Request(
    'http://localhost:8000/api/warehouses/',
    headers={'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJtYW5hZ2VyQGludmVudG9yeS5sb2NhbCIsInJvbGUiOiJtYW5hZ2VyIiwiZXhwIjoxNzc3NDcxMTIzfQ.3NUawy695heWwzyo59WYfzTniEIwf3S6qA0aIHv9la0'}
)
try:
    print(urllib.request.urlopen(req).read().decode())
except urllib.error.HTTPError as e:
    print(f'Status: {e.code}')
    print(f'Response: {e.read().decode()}')