const mediasoupClient = require('mediasoup-client');

class StreamViewer {
    constructor() {
        this.socket = null;
        this.token = null;
        this.device = null;
        this.recvTransport = null;
        this.consumers = new Map();
        
        this.init();
    }

    init() {
        this.log('Initializing stream viewer...');
        this.connectSocket();
    }

    connectSocket() {
        this.socket = io('http://localhost:3001', {
            auth: {
                token: this.token
            }
        });
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            this.log('Connected to server');
        });

        this.socket.on('disconnect', () => {
            this.log('Disconnected from server');
        });

        this.socket.on('stream-joined', (data) => {
            this.log('Stream joined:', data);
            this.updateStatus('viewer-status', `Joined stream: ${data.stream.id}`, 'success');
        });

        this.socket.on('new-producer', (data) => {
            this.log('New producer available:', data);
            this.consumeMedia(data.producerId, data.kind);
        });
        
        this.socket.on('existing-producers', (producers) => {
            this.log('Received existing producers:', producers);
            if (producers && producers.length > 0) {
                producers.forEach(producer => {
                    this.log('Processing existing producer:', producer);
                    this.consumeMedia(producer.id, producer.kind);
                });
            }
        });
    }

    log(message, data = null) {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        console.log(logMessage, data);
        
        const debugDiv = document.getElementById('debug-info');
        debugDiv.innerHTML += logMessage + (data ? ' ' + JSON.stringify(data) : '') + '\n';
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }

    updateStatus(elementId, message, type = 'info') {
        const element = document.getElementById(elementId);
        element.textContent = message;
        element.className = `status ${type}`;
    }

    async register() {
        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('http://localhost:3001/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();
            if (response.ok) {
                this.token = data.token;
                this.updateStatus('auth-status', `Registered: ${username}`, 'success');
                this.log('Registration successful');
            } else {
                this.updateStatus('auth-status', data.message, 'error');
            }
        } catch (error) {
            this.log('Registration error:', error);
            this.updateStatus('auth-status', 'Registration failed', 'error');
        }
    }

    async login() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('http://localhost:3001/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();
            if (response.ok) {
                this.token = data.token;
                this.socket.disconnect();
                this.socket = io('http://localhost:3001', {
                    auth: {
                        token: this.token
                    }
                });
                this.setupSocketListeners();
                this.updateStatus('auth-status', `Logged in: ${email}`, 'success');
                this.log('Login successful');
            } else {
                this.updateStatus('auth-status', data.message, 'error');
            }
        } catch (error) {
            this.log('Login error:', error);
            this.updateStatus('auth-status', 'Login failed', 'error');
        }
    }

    joinStream() {
        const streamId = document.getElementById('stream-id').value;
        if (!streamId) {
            this.updateStatus('viewer-status', 'Please enter stream ID', 'error');
            return;
        }

        this.log('Attempting to join stream:', streamId);
        this.socket.emit('join-stream', { streamId }, (response) => {
            this.log('Join stream response:', response);
            if (response && response.error) {
                this.updateStatus('viewer-status', `Join failed: ${response.error}`, 'error');
            } else if (response && response.success) {
                this.log('Successfully joined stream');
                this.setupViewerWebRTC(streamId);
            } else {
                this.log('Unexpected join response:', response);
                this.updateStatus('viewer-status', 'Unexpected response from server', 'error');
            }
        });
    }

    async setupViewerWebRTC(streamId) {
    try {
        // 1️⃣ Get router capabilities
        this.socket.emit('get-router-capabilities', async (capabilities) => {
            if (!capabilities) {
                this.log('Error: router capabilities are null');
                this.updateStatus('viewer-status', 'Cannot load stream: router capabilities missing', 'error');
                return;
            }

            this.log('Router capabilities received', capabilities);
            
            // 2️⃣ Load mediasoup device
            this.device = new mediasoupClient.Device();
            await this.device.load({ routerRtpCapabilities: capabilities });
            this.log('Viewer device loaded successfully');

            // 3️⃣ Create receive transport
            this.createRecvTransport(streamId);
        });
    } catch (error) {
        this.log('Viewer WebRTC setup error:', error);
    }
}

    async loadViewerDevice(routerRtpCapabilities, streamId) {
        try {
            this.log('Creating mediasoup device for viewing...');
            this.device = new mediasoupClient.Device();
            await this.device.load({ routerRtpCapabilities });
            this.log('Viewer device loaded successfully');
            this.createRecvTransport(streamId);
        } catch (error) {
            this.log('Viewer device load error:', error);
        }
    }

    createRecvTransport(streamId) {
        this.socket.emit('create-transport', {
            roomId: streamId,
            direction: 'recv'
        }, (params) => {
            if (params.error) {
                this.log('Recv transport error:', params.error);
                return;
            }

            this.recvTransport = this.device.createRecvTransport(params);

            this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                try {
                    this.socket.emit('connect-transport', {
                        roomId: streamId,
                        transportId: this.recvTransport.id,
                        dtlsParameters
                    }, (response) => {
                        if (response.error) {
                            errback(new Error(response.error));
                        } else {
                            callback();
                        }
                    });
                } catch (error) {
                    errback(error);
                }
            });

            this.log('Receive transport created successfully');
            
            // Request existing producers after transport is ready
            setTimeout(() => {
                this.socket.emit('get-producers', { roomId: streamId }, (producers) => {
                    this.log('Existing producers:', producers);
                    if (producers && producers.length > 0) {
                        producers.forEach(producer => {
                            this.log('Processing existing producer:', producer);
                            this.consumeMedia(producer.id, producer.kind);
                        });
                    } else {
                        this.log('No existing producers found');
                    }
                });
            }, 1000);
        });
    }

    async consumeMedia(producerId, kind) {
        try {
            this.log(`Attempting to consume ${kind} producer:`, producerId);
            
            this.socket.emit('consume', {
                roomId: document.getElementById('stream-id').value,
                producerId,
                rtpCapabilities: this.device.rtpCapabilities
            }, async (params) => {
                if (params.error) {
                    this.log('Consume error:', params.error);
                    return;
                }

                this.log(`Consuming ${kind} with params:`, params);
                const consumer = await this.recvTransport.consume(params);
                this.consumers.set(kind, consumer);

                const remoteVideo = document.getElementById('remote-video');
                
                // Create or get existing stream
                let stream = remoteVideo.srcObject;
                if (!stream) {
                    stream = new MediaStream();
                    remoteVideo.srcObject = stream;
                }
                
                // Add the track to the stream
                stream.addTrack(consumer.track);
                
                // Show video element and hide placeholder
                remoteVideo.style.display = 'block';
                document.getElementById('no-stream').style.display = 'none';
                
                this.log(`${kind} track added to remote video stream`);
                this.log('Remote video srcObject:', remoteVideo.srcObject);

                this.socket.emit('resume-consumer', {
                    roomId: document.getElementById('stream-id').value,
                    consumerId: consumer.id
                }, (response) => {
                    if (response && response.error) {
                        this.log('Resume consumer error:', response.error);
                    } else {
                        this.log('Consumer resumed successfully');
                    }
                });

                this.log(`${kind} consumer created and resumed`);
                this.updateStatus('viewer-status', `Receiving ${kind} stream`, 'success');
            });
        } catch (error) {
            this.log('Consume media error:', error);
        }
    }

    leaveStream() {
        if (this.recvTransport) {
            this.recvTransport.close();
            this.recvTransport = null;
        }
        this.consumers.clear();
        const remoteVideo = document.getElementById('remote-video');
        remoteVideo.srcObject = null;
        remoteVideo.style.display = 'none';
        document.getElementById('no-stream').style.display = 'block';
        this.updateStatus('viewer-status', 'Left stream', 'info');
        this.log('Left stream');
    }
}

// Global variables
let streamViewer;

// Global functions for HTML onclick events
window.login = function() { 
    if (streamViewer) streamViewer.login(); 
    else console.error('StreamViewer not initialized');
};

window.register = function() { 
    if (streamViewer) streamViewer.register(); 
    else console.error('StreamViewer not initialized');
};

window.joinStream = function() { 
    if (streamViewer) streamViewer.joinStream(); 
    else console.error('StreamViewer not initialized');
};

window.leaveStream = function() { 
    if (streamViewer) streamViewer.leaveStream(); 
    else console.error('StreamViewer not initialized');
};

window.toggleRemoteAudio = function() {
    if (streamViewer) streamViewer.toggleRemoteAudio();
    else console.error('StreamViewer not initialized');
};

// Initialize when page loads
window.addEventListener('load', () => {
    console.log('Starting stream viewer application');
    streamViewer = new StreamViewer();
});