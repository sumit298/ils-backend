const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
let authToken = null;
let streamId = null;
let userId = null;

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(message, type = 'info') {
    const color = type === 'success' ? colors.green : 
                  type === 'error' ? colors.red : 
                  type === 'warning' ? colors.yellow : colors.blue;
    console.log(`${color}${message}${colors.reset}`);
}

async function testAPI(name, fn) {
    try {
        log(`\n🧪 Testing: ${name}`, 'blue');
        await fn();
        log(`✅ PASSED: ${name}`, 'success');
        return true;
    } catch (error) {
        log(`❌ FAILED: ${name}`, 'error');
        log(`   Error: ${error.message}`, 'error');
        if (error.response) {
            log(`   Status: ${error.response.status}`, 'error');
            log(`   Data: ${JSON.stringify(error.response.data)}`, 'error');
        }
        return false;
    }
}

// Auth Tests
async function testRegister() {
    const response = await axios.post(`${BASE_URL}/api/auth/register`, {
        username: `testuser_${Date.now()}`,
        email: `test_${Date.now()}@example.com`,
        password: 'testpass123'
    });
    authToken = response.data.token;
    userId = response.data.user.id;
    log(`   Token: ${authToken.substring(0, 20)}...`);
}

async function testLogin() {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
        email: 'testuser@example.com',
        password: 'testpass'
    });
    authToken = response.data.token;
    log(`   Token: ${authToken.substring(0, 20)}...`);
}

async function testGetProfile() {
    const response = await axios.get(`${BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    log(`   User: ${response.data.username}`);
}

async function testRefreshToken() {
    const response = await axios.post(`${BASE_URL}/api/auth/refresh-token`, {
        token: authToken
    });
    log(`   New Token: ${response.data.token.substring(0, 20)}...`);
}

// Stream Tests
async function testCreateStream() {
    // First, get all streams and delete any active ones
    try {
        const streams = await axios.get(`${BASE_URL}/api/streams`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        for (const stream of streams.data) {
            if (stream.userId === userId || stream.isLive) {
                await axios.delete(`${BASE_URL}/api/streams/${stream.id}`, {
                    headers: { Authorization: `Bearer ${authToken}` }
                }).catch(() => {});
            }
        }
    } catch (e) {}
    
    const response = await axios.post(`${BASE_URL}/api/streams`, {
        title: 'Test Stream',
        description: 'API Test Stream',
        category: 'gaming'
    }, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    streamId = response.data.id;
    log(`   Stream ID: ${streamId}`);
}

async function testGetAllStreams() {
    const response = await axios.get(`${BASE_URL}/api/streams`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    log(`   Total Streams: ${response.data.length}`);
}

async function testGetStreamById() {
    const response = await axios.get(`${BASE_URL}/api/streams/${streamId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    log(`   Stream: ${response.data.title}`);
}

async function testUpdateStream() {
    const response = await axios.put(`${BASE_URL}/api/streams/${streamId}`, {
        title: 'Updated Test Stream',
        description: 'Updated description'
    }, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    log(`   Updated Title: ${response.data.title}`);
}

async function testJoinStream() {
    const response = await axios.post(`${BASE_URL}/api/streams/${streamId}/join`, {}, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    log(`   Joined: ${response.data.message}`);
}

async function testGetStreamStats() {
    const response = await axios.get(`${BASE_URL}/api/streams/${streamId}/stats`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    log(`   Viewers: ${response.data.viewers}`);
}

// Chat Tests
async function testSendChatMessage() {
    const response = await axios.post(`${BASE_URL}/api/chat/${streamId}`, {
        content: 'Hello from API test!'
    }, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    log(`   Message ID: ${response.data.id}`);
}

async function testGetChatMessages() {
    const response = await axios.get(`${BASE_URL}/api/chat/${streamId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    log(`   Total Messages: ${response.data.length}`);
}

async function testGetChatStats() {
    const response = await axios.get(`${BASE_URL}/api/chat/${streamId}/stats`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    log(`   Message Count: ${response.data.messageCount}`);
}

// Cleanup
async function testDeleteStream() {
    const response = await axios.delete(`${BASE_URL}/api/streams/${streamId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    log(`   Deleted: ${response.data.message}`);
}

async function testLogout() {
    const response = await axios.post(`${BASE_URL}/api/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    log(`   Logged out: ${response.data.message}`);
}

// Main Test Runner
async function runAllTests() {
    log('\n🚀 Starting API Tests...', 'blue');
    log('='.repeat(50), 'blue');

    const results = {
        passed: 0,
        failed: 0,
        total: 0
    };

    const tests = [
        // Auth Tests
        ['Register User', testRegister],
        ['Login User', testLogin],
        ['Get User Profile', testGetProfile],
        ['Refresh Token', testRefreshToken],
        
        // Stream Tests
        ['Create Stream', testCreateStream],
        ['Get All Streams', testGetAllStreams],
        ['Get Stream By ID', testGetStreamById],
        ['Update Stream', testUpdateStream],
        ['Join Stream', testJoinStream],
        ['Get Stream Stats', testGetStreamStats],
        
        // Chat Tests
        ['Send Chat Message', testSendChatMessage],
        ['Get Chat Messages', testGetChatMessages],
        ['Get Chat Stats', testGetChatStats],
        
        // Cleanup
        ['Delete Stream', testDeleteStream],
        ['Logout User', testLogout]
    ];

    for (const [name, fn] of tests) {
        results.total++;
        const passed = await testAPI(name, fn);
        if (passed) results.passed++;
        else results.failed++;
        await new Promise(resolve => setTimeout(resolve, 500)); // Delay between tests
    }

    log('\n' + '='.repeat(50), 'blue');
    log('📊 Test Results:', 'blue');
    log(`   Total: ${results.total}`, 'blue');
    log(`   Passed: ${results.passed}`, 'success');
    log(`   Failed: ${results.failed}`, results.failed > 0 ? 'error' : 'success');
    log(`   Success Rate: ${((results.passed / results.total) * 100).toFixed(2)}%`, 
        results.failed === 0 ? 'success' : 'warning');
    log('='.repeat(50), 'blue');

    process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
    log(`\n💥 Fatal Error: ${error.message}`, 'error');
    process.exit(1);
});
