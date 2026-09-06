const express = require('express');
const path = require('path');
const app = express();
const PORT = 6767;

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Example API endpoint
app.get('/api/message', (req, res) => {
    
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});