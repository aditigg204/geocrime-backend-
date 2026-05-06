# Quick Postman Examples

## Login
POST http://localhost:5000/api/auth/login
```json
{"email":"admin@geocrime.com","password":"123456"}
```

## Admin Dashboard
GET http://localhost:5000/api/admin/dashboard
Header: Authorization: Bearer TOKEN

## Citizen Dashboard
GET http://localhost:5000/api/citizen/dashboard?lat=28.61&lng=77.21
Header: Authorization: Bearer TOKEN

## Submit Report
POST http://localhost:5000/api/reports
Header: Authorization: Bearer TOKEN
Body JSON:
```json
{
  "type":"Theft",
  "description":"Mobile theft near market",
  "lat":28.61,
  "lng":77.21,
  "isAnonymous":false,
  "severityScore":3
}
```

## Assistant Message
POST http://localhost:5000/api/assistant/message
Header: Authorization: Bearer TOKEN
```json
{
  "role":"analyst",
  "message":"Why is Civil Lines red?",
  "context":{"screen":"dashboard"}
}
```
