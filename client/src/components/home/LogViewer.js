import React, { Component } from 'react';
import './logviewer.css';

class LogViewer extends Component {
    constructor(props) {
        super(props);
        this.state = {
            logs: [],
            autoScroll: true,
            connected: false,
            reconnectAttempts: 0
        };
        this.ws = null;
        this.logContainerRef = React.createRef();
        this.reconnectTimer = null;
    }

    componentDidMount() {
        this.connect();
    }

    componentWillUnmount() {
        if (this.ws) {
            this.ws.close();
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.state.autoScroll && this.state.logs.length !== prevState.logs.length) {
            this.scrollToBottom();
        }
    }

    connect = () => {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.hostname}:3000/logs-ws`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.setState({ connected: true, reconnectAttempts: 0 });
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'history') {
                    this.setState({ logs: data.logs }, this.scrollToBottom);
                } else if (data.type === 'log') {
                    this.setState(prevState => ({
                        logs: [...prevState.logs.slice(-999), data.log]
                    }));
                }
            } catch (e) {
                console.error('Failed to parse log message:', e);
            }
        };

        this.ws.onclose = () => {
            this.setState({ connected: false });
            this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
            console.error('Log WebSocket error:', error);
        };
    };

    scheduleReconnect = () => {
        const { reconnectAttempts } = this.state;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);

        this.reconnectTimer = setTimeout(() => {
            this.setState(
                prevState => ({ reconnectAttempts: prevState.reconnectAttempts + 1 }),
                this.connect
            );
        }, delay);
    };

    scrollToBottom = () => {
        if (this.logContainerRef.current) {
            this.logContainerRef.current.scrollTop = this.logContainerRef.current.scrollHeight;
        }
    };

    toggleAutoScroll = () => {
        this.setState(prevState => ({ autoScroll: !prevState.autoScroll }));
    };

    clearLogs = () => {
        this.setState({ logs: [] });
    };

    getLogClassName = (level) => {
        switch (level) {
            case 'error': return 'log-entry log-error';
            case 'warn': return 'log-entry log-warn';
            case 'debug': return 'log-entry log-debug';
            case 'info': return 'log-entry log-info';
            default: return 'log-entry';
        }
    };

    formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
    };

    render() {
        const { logs, autoScroll, connected } = this.state;

        return (
            <div className="log-viewer">
                <div className="log-header">
                    <h3>Server Logs</h3>
                    <div className="log-controls">
                        <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                            {connected ? 'Connected' : 'Disconnected'}
                        </span>
                        <label className="auto-scroll-label">
                            <input
                                type="checkbox"
                                checked={autoScroll}
                                onChange={this.toggleAutoScroll}
                            />
                            Auto-scroll
                        </label>
                        <button onClick={this.clearLogs} className="clear-btn">
                            Clear
                        </button>
                    </div>
                </div>
                <div className="log-container" ref={this.logContainerRef}>
                    {logs.map((log, index) => (
                        <div key={index} className={this.getLogClassName(log.level)}>
                            <span className="log-timestamp">{this.formatTimestamp(log.timestamp)}</span>
                            <span className="log-service">[{log.service}]</span>
                            <span className="log-type">&lt;{log.type}&gt;</span>
                            <span className="log-message">{log.message}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
}

export default LogViewer;
