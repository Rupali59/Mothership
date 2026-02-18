package lifecycle

import (
	"net"
	"net/http"
	"time"
)

// NewServiceTransport returns a tuned transport for inter-service/proxy use (connection pooling, timeouts).
func NewServiceTransport() *http.Transport {
	return &http.Transport{
		MaxIdleConns:        20,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
		DisableKeepAlives:   false,
		DialContext: (&net.Dialer{
			Timeout:   3 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   3 * time.Second,
		ResponseHeaderTimeout: 5 * time.Second,
	}
}

// NewServiceClient returns an HTTP client with a tuned transport for inter-service calls:
// connection pooling, dial/header timeouts, and keep-alive.
// timeout is the overall request timeout; if 0, 10s is used.
func NewServiceClient(timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: NewServiceTransport(),
	}
}
