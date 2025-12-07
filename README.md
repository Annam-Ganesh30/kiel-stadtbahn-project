# Kiel Stadtbahn Simulator 🚆  
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

