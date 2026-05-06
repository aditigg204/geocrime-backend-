# Officer Dashboard - Complete Build Plan

## Current Status Analysis

### ✅ BACKEND - What's Already Real
- Dashboard endpoint: GET `/officer/dashboard` ✅
- Incident list: GET `/officer/incidents` ✅
- Patrol plan: GET `/officer/patrol-plan` ✅
- Generate patrol route: POST `/officer/patrol-routes/generate` ✅
- Update incident status: PATCH `/incidents/:id/status` ✅
- Heatmap: GET `/officer/heatmap` ✅

### ✅ DATABASE - What's Ready
- Zone (riskScore, riskLevel, lat, lng, boundaryJson)
- Incident (lat, lng, type, status, priority, assignedOfficerId)
- Hotspot (centerLat, centerLng, riskScore, dominantCrimeType)
- MlPrediction (predictedRiskScore, predictedRiskLevel)
- Alert (severity, userId, zoneId)
- SosEvent (lat, lng, nearestOfficerId)
- PatrolRoute (officerId, zoneIds, status)
- IncidentStatusHistory (oldStatus, newStatus, comment)

### ⚠️ WHAT NEEDS REAL IMPLEMENTATION
1. **Dashboard Metrics** - Load from DB, NOT hardcoded
2. **Heatmap** - Real data from Hotspots + Incidents
3. **Patrol Route** - Real Google Maps route generation
4. **Incident Status** - Real-time update with WebSocket
5. **Settings** - Make all toggles functional
6. **Chatbot** - Real integration, not dummy
7. **Google Maps** - Real map rendering, proper markers

### ❌ KNOWN ISSUES
- Hardcoded metric values in OfficerHomeScreen (08, 12, 04)
- Heatmap might show static/fake data
- Patrol routes might not integrate with Google Maps
- Settings toggles might not save to database
- Chatbot might return dummy responses

---

## IMPLEMENTATION CHECKLIST

### Phase 1: Backend Fixes
- [ ] Verify all endpoints return real DB data
- [ ] Add missing endpoints
- [ ] Implement real heatmap generation
- [ ] Fix patrol route logic
- [ ] Add socket.io real-time updates

### Phase 2: Frontend Integration
- [ ] Update Officer Dashboard to fetch real data
- [ ] Implement real heatmap rendering
- [ ] Add Google Maps integration
- [ ] Real patrol route visualization
- [ ] Real-time status updates via WebSocket

### Phase 3: Features
- [ ] Incident detail with full history
- [ ] Status update workflow
- [ ] Settings persistence
- [ ] Chatbot real integration
- [ ] Emergency SOS handling

### Phase 4: Testing
- [ ] Test all data fetching
- [ ] Verify real-time updates
- [ ] Test patrol route generation
- [ ] Verify settings save
- [ ] Test status update flow

---

## Database Calculations for Officer Dashboard

```sql
-- New Incidents (today)
SELECT COUNT(*) FROM Incident 
WHERE assignedOfficerId = officer_id 
AND status = 'submitted'
AND DATE(createdAt) = CURRENT_DATE

-- Pending Cases
SELECT COUNT(*) FROM Incident 
WHERE assignedOfficerId = officer_id 
AND status IN ('submitted', 'under_review')

-- Responding
SELECT COUNT(*) FROM Incident 
WHERE assignedOfficerId = officer_id 
AND status = 'responding'

-- Resolved Today
SELECT COUNT(*) FROM Incident 
WHERE assignedOfficerId = officer_id 
AND status = 'resolved'
AND DATE(createdAt) = CURRENT_DATE

-- High Risk Zones
SELECT * FROM Zone 
WHERE riskLevel = 'red' 
ORDER BY riskScore DESC 
LIMIT 5

-- Assigned Zone Data
SELECT * FROM Zone WHERE id = officer.assignedZoneId
INCLUDE incidents, hotspots, predictions

-- Nearby Hotspots
SELECT * FROM Hotspot 
WHERE zoneId = officer.assignedZoneId 
ORDER BY riskScore DESC 
LIMIT 5

-- Latest ML Prediction
SELECT * FROM MlPrediction 
WHERE zoneId = officer.assignedZoneId 
ORDER BY predictionDate DESC 
LIMIT 1
```

---

## API Endpoints - Should Return REAL Data

### GET /officer/dashboard
```json
{
  "shiftSummary": {
    "newIncidents": 8,        // Real count from DB
    "pending": 12,            // Real count from DB
    "responding": 4,          // Real count from DB
    "resolved": 23            // Real count from DB
  },
  "assignedZone": {            // Real zone data
    "id": "zone-1",
    "name": "Zone A",
    "riskScore": 75,
    "riskLevel": "red"
  },
  "redZones": [],              // Real high-risk zones
  "alerts": [],                // Real unread alerts
  "todayStrategy": {}          // Real ML recommendations
}
```

### GET /officer/heatmap
Should return:
- All incidents in assigned zone (past 7 days)
- All hotspots in assigned zone
- Each with: lat, lng, riskScore, type, count

### POST /officer/patrol-routes/generate
Should:
1. Get high-risk zones
2. Calculate optimal route using haversine
3. Create PatrolRoute in DB
4. Return route with coordinates

### PATCH /incidents/:id/status
Should:
1. Validate status transition
2. Update incident.status
3. Create IncidentStatusHistory
4. Emit WebSocket update to citizen
5. Create Alert notification

---

## Frontend Components - Required Changes

### OfficerHomeScreen
- [ ] Fetch `/officer/dashboard` instead of hardcoded values
- [ ] Display real metrics
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add refresh button

### LiveHeatmapScreen
- [ ] Fetch `/officer/heatmap` data
- [ ] Render markers on map
- [ ] Color code by risk level (red/yellow/green)
- [ ] Add legend
- [ ] Add real-time updates via WebSocket

### IncidentFeedScreen
- [ ] Fetch `/officer/incidents`
- [ ] Show status badges (submitted/under_review/responding/resolved)
- [ ] Add incident detail view
- [ ] Real-time status updates
- [ ] Update UI when status changes

### PatrolPlannerScreen
- [ ] Fetch `/officer/patrol-plan`
- [ ] Display recommendations
- [ ] Click to generate route
- [ ] Show generated route on map
- [ ] Start/end patrol

### Settings
- [ ] Save each toggle to database (UserSettings)
- [ ] Load settings on app start
- [ ] Real-time sync

---

## Socket.io Events - Real-time Updates

**From Server:**
- `incident:assigned` - New incident assigned
- `incident:updated` - Status changed
- `alert:new` - New alert
- `sos:emergency` - SOS alert
- `patrol:started` - Officer started patrol

**From Client:**
- `incident:status_update` - Officer updates status
- `location:update` - Officer shares location
- `patrol:route_generated` - Patrol route created

---

## Priority Order for Implementation

1. **HIGH**: Make dashboard metrics REAL (not hardcoded)
2. **HIGH**: Real heatmap data from DB
3. **HIGH**: Real incident status updates
4. **MEDIUM**: Patrol route generation
5. **MEDIUM**: Settings persistence
6. **MEDIUM**: Google Maps integration
7. **LOW**: Chatbot integration

---

## Testing Checklist

- [ ] Create officer account
- [ ] Assign to zone
- [ ] Create incidents in zone
- [ ] Verify dashboard shows real metrics
- [ ] Open heatmap, verify markers appear
- [ ] Update incident status
- [ ] Verify status history saved
- [ ] Verify citizen receives update
- [ ] Generate patrol route
- [ ] Start patrol
- [ ] Change settings, verify saved
- [ ] Receive real-time alerts
