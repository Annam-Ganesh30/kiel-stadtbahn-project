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
npm run build
```
---

## 📁 Project Structure
```
src/
 ├── components/
 │    └── MapView.vue       # Main routing + map logic
 ├── assets/
 ├── App.vue
 ├── main.ts
 └── style.css
```

---
##  Route Algorithm (Optimal Path Logic)

The app builds a graph:

### ✔ Nodes → Stations  
### ✔ Edges → Neighbor connections  
### ✔ Weights →  
- Station-to-station distance  
- + Line-transfer penalty  
Formula:

```
cost = distance + transferPenalty (if line changes)
```
This produces realistic routes.

### Example: Wikkanal → Samwerstrasse  
Correct optimal route:

```
Wikkanal → Auberg → Knorrstrasse → Elendsredder → Leibnizstrasse 
→ Unisportstätten → Uniipn → Uniaudimax → Samwerstrasse
```

Not the longer route via Hauptbahnhof.

---
### Run ESLint
```bash
npm run lint
```

✅ The codebase passes ESLint without errors or warnings.

This ensures consistent code style, best practices, and maintainability according to course requirements.

---

##  Accessibility 

- Fully keyboard-navigable  
- Buttons have accessible labels  
- Color contrast validated  
- Screen-reader friendly structure  

⚠️ Note:  
OpenLayers uses canvas-based rendering, which cannot fully achieve 100% ARIA compliance; therefore, Lighthouse Accessibility score may be slightly lower.

---

## 🔗 Version Control

Repository maintained on **GitHub** using:

```
main → production branch
GitHub Personal Access Token (PAT) for authentication
```

---

## License
This project is created for academic coursework and is not intended for commercial use.

