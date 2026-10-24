# Planner differences

Mashhad's public scope is 36 stations on Lines 1/2. This comparison describes
the existing implementations, not a promise of data verification.

| Feature | Tehran | Mashhad |
| --- | --- | --- |
| Origin/destination landmark search | Online, within Tehran | Online, within Mashhad; exact point linked to a nearby scoped station |
| Departure times and arrival/travel estimates | Existing timetables and labelled fallback estimates | Unavailable; no empty time cards |
| Depart-at/arrive-by planning, missed departures and refresh warnings | Supported | Unavailable without timetables |
| Metro route choice | Timetable-aware planning | Fewest line changes, then fewest track hops |
| Walking-only versus metro recommendations | Uses journey timing | No timed comparison; selected-place walking connections are supported |
| Coverage | Existing seven-line Tehran network | Lines 1/2 only; Line 3 withheld |
| Amenities | Existing Tehran data | Source-reported, explicitly unverified; canonical values remain unknown |
| GPS naming | Can resolve a neighborhood label | GPS uses the generic location label; searched landmarks retain their names |
| WebMCP tools and route-success rating triggers | Tehran integrations | Not connected to Mashhad's path planner |

Both cities use the shared map, station cards, keyboard-accessible pickers,
route actions, intermediate-stop disclosure, Nearby/GPS and map endpoint
selection. City-specific IDs distinguish identically named stations.
Nearby and the combined-city picker still use stations/GPS rather than online
landmark search. Landmark search depends on provider availability and connectivity;
it does not establish entrance positions or real-time station service.
