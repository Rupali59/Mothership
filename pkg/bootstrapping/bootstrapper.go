package bootstrapping

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"go.uber.org/zap"
)

// Bootstrapper handles the initial setup of a service, including logging,
// configuration, and core storage connections.
type Bootstrapper struct {
	logger *zap.Logger
	hooks  []func(ctx context.Context) error
}

// NewBootstrapper creates a new Bootstrapper instance.
func NewBootstrapper() *Bootstrapper {
	// Initialize a basic logger until a full configuration is loaded
	logger, _ := zap.NewDevelopment()
	return &Bootstrapper{
		logger: logger,
		hooks:  make([]func(ctx context.Context) error, 0),
	}
}

// RegisterHook adds an initialization hook to the bootstrapping sequence.
func (b *Bootstrapper) RegisterHook(hook func(ctx context.Context) error) {
	b.hooks = append(b.hooks, hook)
}

// Run executes all registered hooks and waits for a shutdown signal.
// It returns a context that is cancelled when a shutdown signal is received.
func (b *Bootstrapper) Run(ctx context.Context) (context.Context, context.CancelFunc) {
	b.logger.Info("bootstrapping service...")

	for i, hook := range b.hooks {
		b.logger.Debug(fmt.Sprintf("executing boot hook %d", i))
		if err := hook(ctx); err != nil {
			b.logger.Fatal("boot hook failed", zap.Error(err))
		}
	}

	b.logger.Info("bootstrapping complete")

	// Create a context that listens for shutdown signals
	ctx, cancel := context.WithCancel(ctx)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-quit
		b.logger.Info("shutdown signal received", zap.String("signal", sig.String()))
		cancel()
	}()

	return ctx, cancel
}

// Logger returns the bootstrapper's logger.
func (b *Bootstrapper) Logger() *zap.Logger {
	return b.logger
}

// SetLogger allows replacing the initial logger with a configured one.
func (b *Bootstrapper) SetLogger(l *zap.Logger) {
	b.logger = l
}
