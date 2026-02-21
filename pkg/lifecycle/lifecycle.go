package lifecycle

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

const (
	StateStarting = iota
	StateReady
	StateDraining
	StateStopped
)

// ReadinessCheck is called by the readiness probe. Return non-nil to report not ready.
type ReadinessCheck func(ctx context.Context) error

// Server wraps an http.Server with graceful startup/shutdown and probe endpoints.
type Server struct {
	httpServer *http.Server
	router     *gin.Engine
	logger     *zap.Logger

	state          atomic.Int32
	startupDone    atomic.Bool
	shutdownBudget time.Duration
	drainPeriod    time.Duration

	onShutdown     []func(ctx context.Context)
	readinessCheck ReadinessCheck
}

// New creates a Server with sensible defaults and registers /healthz, /readyz, /startupz, /health.
func New(router *gin.Engine, port string, logger *zap.Logger) *Server {
	s := &Server{
		router:         router,
		logger:         logger,
		shutdownBudget: 26 * time.Second,
		drainPeriod:    3 * time.Second,
	}

	s.httpServer = &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	router.GET("/healthz", s.livenessHandler)
	router.GET("/readyz", s.readinessHandler)
	router.GET("/startupz", s.startupHandler)
	// Note: /health is handled by the application router in core-server to provide comprehensive status

	return s
}

// OnShutdown registers a hook called during shutdown (in order).
func (s *Server) OnShutdown(fn func(ctx context.Context)) {
	s.onShutdown = append(s.onShutdown, fn)
}

// SetReadinessCheck sets an optional dependency check for the readiness probe.
// If set, readyz and /health will call it; any error returns 503.
func (s *Server) SetReadinessCheck(fn ReadinessCheck) {
	s.readinessCheck = fn
}

// MarkReady signals that startup is complete and traffic can be accepted.
func (s *Server) MarkReady() {
	s.startupDone.Store(true)
	s.state.Store(StateReady)
}

// State returns the current state (StateStarting, StateReady, StateDraining, StateStopped).
func (s *Server) State() int32 {
	return s.state.Load()
}

// Run starts the HTTP server and blocks until shutdown completes.
func (s *Server) Run() error {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	errCh := make(chan error, 1)
	go func() {
		s.logger.Info("server starting", zap.String("addr", s.httpServer.Addr))
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	select {
	case sig := <-quit:
		s.logger.Info("shutdown signal received", zap.String("signal", sig.String()))
	case err := <-errCh:
		return fmt.Errorf("server failed: %w", err)
	}

	return s.shutdown()
}

func (s *Server) shutdown() error {
	start := time.Now()
	s.state.Store(StateDraining)
	s.logger.Info("entering drain period", zap.Duration("duration", s.drainPeriod))
	time.Sleep(s.drainPeriod)
	s.logger.Info("drain period complete", zap.Duration("elapsed", time.Since(start)))

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	httpStart := time.Now()
	if err := s.httpServer.Shutdown(shutdownCtx); err != nil {
		s.logger.Error("http server shutdown error", zap.Error(err))
	}
	s.logger.Info("http server shutdown complete", zap.Duration("elapsed", time.Since(httpStart)))

	// Per-hook timeout budget (GAP 15): each hook gets an equal share of the remaining budget
	remaining := s.shutdownBudget - s.drainPeriod - 10*time.Second
	if remaining < time.Second {
		remaining = 5 * time.Second
	}
	if len(s.onShutdown) > 0 {
		perHook := remaining / time.Duration(len(s.onShutdown))
		if perHook < 2*time.Second {
			perHook = 2 * time.Second
		}
		for i, fn := range s.onShutdown {
			hookStart := time.Now()
			hookCtx, hookCancel := context.WithTimeout(context.Background(), perHook)
			fn(hookCtx)
			hookCancel()
			s.logger.Debug("shutdown hook completed", zap.Int("hook", i), zap.Duration("elapsed", time.Since(hookStart)))
		}
	}

	s.state.Store(StateStopped)
	s.logger.Info("shutdown complete", zap.Duration("total", time.Since(start)))
	return nil
}

func (s *Server) livenessHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "alive"})
}

func (s *Server) readinessHandler(c *gin.Context) {
	if s.state.Load() == StateDraining {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "draining"})
		return
	}
	if s.state.Load() != StateReady {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not_ready"})
		return
	}
	if s.readinessCheck != nil {
		if err := s.readinessCheck(c.Request.Context()); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not_ready", "error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}

func (s *Server) startupHandler(c *gin.Context) {
	if !s.startupDone.Load() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "starting"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "started"})
}
