// server.js - FieldRoutes Integration Server
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://app.missiveapp.com'],
    credentials: true
}));

app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
});
app.use(limiter);

// FieldRoutes API configuration
const FIELDROUTES_CONFIG = {
    baseURL: process.env.FIELDROUTES_API_URL || 'https://api.fieldroutes.com/v1',
    timeout: 10000
};

// Create axios instance for FieldRoutes API
const createFieldRoutesClient = (apiKey, apiSecret) => {
    return axios.create({
        baseURL: FIELDROUTES_CONFIG.baseURL,
        timeout: FIELDROUTES_CONFIG.timeout,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'X-API-Secret': apiSecret,
            'Content-Type': 'application/json'
        }
    });
};

// Middleware to validate API credentials
const validateCredentials = (req, res, next) => {
    const { apiKey, apiSecret } = req.headers;
    
    if (!apiKey || !apiSecret) {
        return res.status(401).json({ 
            error: 'Missing API credentials',
            message: 'API key and secret are required' 
        });
    }
    
    req.fieldRoutesClient = createFieldRoutesClient(apiKey, apiSecret);
    next();
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Search customers by email
app.get('/api/customers/search/email/:email', validateCredentials, async (req, res) => {
    try {
        const { email } = req.params;
        
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ 
                error: 'Invalid email address',
                message: 'Please provide a valid email address' 
            });
        }

        const response = await req.fieldRoutesClient.get('/customers', {
            params: {
                email: email,
                limit: 10
            }
        });

        res.json({
            success: true,
            data: response.data.customers || [],
            total: response.data.total || 0
        });

    } catch (error) {
        handleApiError(error, res, 'Failed to search customers by email');
    }
});

// Search customers by phone
app.get('/api/customers/search/phone/:phone', validateCredentials, async (req, res) => {
    try {
        const { phone } = req.params;
        
        if (!phone) {
            return res.status(400).json({ 
                error: 'Phone number required',
                message: 'Please provide a phone number' 
            });
        }

        const cleanPhone = phone.replace(/\D/g, ''); // Remove non-digits
        
        const response = await req.fieldRoutesClient.get('/customers', {
            params: {
                phone: cleanPhone,
                limit: 10
            }
        });

        res.json({
            success: true,
            data: response.data.customers || [],
            total: response.data.total || 0
        });

    } catch (error) {
        handleApiError(error, res, 'Failed to search customers by phone');
    }
});

// General customer search
app.get('/api/customers/search', validateCredentials, async (req, res) => {
    try {
        const { q, limit = 10, offset = 0 } = req.query;
        
        if (!q || q.trim().length < 2) {
            return res.status(400).json({ 
                error: 'Invalid search query',
                message: 'Search query must be at least 2 characters long' 
            });
        }

        const response = await req.fieldRoutesClient.get('/customers/search', {
            params: {
                q: q.trim(),
                limit: Math.min(limit, 50), // Cap limit at 50
                offset: Math.max(offset, 0)
            }
        });

        res.json({
            success: true,
            data: response.data.customers || [],
            total: response.data.total || 0,
            query: q.trim()
        });

    } catch (error) {
        handleApiError(error, res, 'Failed to search customers');
    }
});

// Get customer by ID
app.get('/api/customers/:id', validateCredentials, async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id || !isValidCustomerId(id)) {
            return res.status(400).json({ 
                error: 'Invalid customer ID',
                message: 'Please provide a valid customer ID' 
            });
        }

        const response = await req.fieldRoutesClient.get(`/customers/${id}`);

        res.json({
            success: true,
            data: response.data
        });

    } catch (error) {
        if (error.response?.status === 404) {
            return res.status(404).json({
                error: 'Customer not found',
                message: 'No customer found with the provided ID'
            });
        }
        handleApiError(error, res, 'Failed to fetch customer');
    }
});

// Get customer service history
app.get('/api/customers/:id/services', validateCredentials, async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 20, offset = 0 } = req.query;
        
        if (!id || !isValidCustomerId(id)) {
            return res.status(400).json({ 
                error: 'Invalid customer ID',
                message: 'Please provide a valid customer ID' 
            });
        }

        const response = await req.fieldRoutesClient.get(`/customers/${id}/services`, {
            params: {
                limit: Math.min(limit, 100),
                offset: Math.max(offset, 0),
                sort: 'date_desc'
            }
        });

        res.json({
            success: true,
            data: response.data.services || [],
            total: response.data.total || 0
        });

    } catch (error) {
        if (error.response?.status === 404) {
            return res.status(404).json({
                error: 'Customer not found',
                message: 'No customer found with the provided ID'
            });
        }
        handleApiError(error, res, 'Failed to fetch service history');
    }
});

// Get customer appointments
app.get('/api/customers/:id/appointments', validateCredentials, async (req, res) => {
    try {
        const { id } = req.params;
        const { status = 'all', limit = 10 } = req.query;
        
        if (!id || !isValidCustomerId(id)) {
            return res.status(400).json({ 
                error: 'Invalid customer ID',
                message: 'Please provide a valid customer ID' 
            });
        }

        const params = {
            customer_id: id,
            limit: Math.min(limit, 50)
        };

        if (status !== 'all') {
            params.status = status;
        }

        const response = await req.fieldRoutesClient.get('/appointments', {
            params
        });

        res.json({
            success: true,
            data: response.data.appointments || [],
            total: response.data.total || 0
        });

    } catch (error) {
        handleApiError(error, res, 'Failed to fetch appointments');
    }
});

// Test API credentials
app.post('/api/test-credentials', async (req, res) => {
    try {
        const { apiKey, apiSecret, baseUrl } = req.body;
        
        if (!apiKey || !apiSecret) {
            return res.status(400).json({
                error: 'Missing credentials',
                message: 'API key and secret are required'
            });
        }

        const testClient = createFieldRoutesClient(apiKey, apiSecret);
        if (baseUrl) {
            testClient.defaults.baseURL = baseUrl;
        }

        // Test with a simple API call
        const response = await testClient.get('/customers', {
            params: { limit: 1 }
        });

        res.json({
            success: true,
            message: 'Credentials are valid',
            data: {
                connected: true,
                baseUrl: testClient.defaults.baseURL
            }
        });

    } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'The provided API credentials are invalid'
            });
        }
        
        handleApiError(error, res, 'Failed to test credentials');
    }
});

// Utility functions
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidCustomerId(id) {
    // Adjust this validation based on FieldRoutes ID format
    return /^[a-zA-Z0-9-_]+$/.test(id) && id.length > 0 && id.length < 100;
}

function handleApiError(error, res, defaultMessage) {
    console.error('API Error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message || defaultMessage;
    
    res.status(status).json({
        error: 'API Error',
        message: message,
        details: process.env.NODE_ENV === 'development' ? error.response?.data : undefined
    });
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: 'The requested endpoint was not found'
    });
});

app.listen(PORT, () => {
    console.log(`FieldRoutes integration server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
