# Kiel Stadtbahn Simulator 🚆  
A route optimization simulator for the Kiel Stadtbahn network.  
Built using **Vue 3**, **TypeScript**, **Vite**, and **OpenLayers**, this application computes the **optimal path** between stations using a weighted Dijkstra algorithm with line-transfer penalties.

---

##  Project Overview
This simulator displays the complete Kiel Stadtbahn network on an interactive map.  
Users can select any **Start** and **End** station, and the system calculates the **most optimal route**, not just the shortest distance.

Optimal route considers:  
✔ Fewer transfers  
✔ Correct station order  
✔ Realistic travel lines  
✔ No line “jumping”  
✔ Shortest weighted path  

---

##  Features
- Interactive OpenLayers map  
- Selectable **Start** and **End** stations  
- Optimal routing using **Dijkstra’s Algorithm**  
- Transfer penalties for realistic line behavior  
- Colored route paths based on line ID  
- Clear route button resets the map + zoom  
- Auto zoom-out after reaching destination  
- Keyboard-accessible UI  
- Smooth travel animation  

---

##  Technology Stack
- **Vue 3**
- **TypeScript**
- **OpenLayers**
- **Vite**
- **ESLint** (`@dataport/eslint-config-geodev`)

---

##  Running the Project

###  Install dependencies
```bash
npm install
```

###  Run development server
```bash
npm run dev
```

App available at:
👉 http://localhost:5173/

---

##  Build for Production
```bash
