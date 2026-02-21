package bootstrapping

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// NewLogger creates a configured zap logger based on the environment.
func NewLogger(isProduction bool) *zap.Logger {
	var config zap.Config
	if isProduction {
		config = zap.NewProductionConfig()
	} else {
		config = zap.NewDevelopmentConfig()
		config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	}

	logger, err := config.Build()
	if err != nil {
		// Fallback to a basic logger if configuration fails
		logger, _ = zap.NewProduction()
	}
	return logger
}

var (
	// GlobalLogger is a convenience variable for accessing the logger
	// throughout the application after it has been initialized by the bootstrapper.
	GlobalLogger *zap.Logger
)

// InitGlobalLogger initializes the GlobalLogger variable.
func InitGlobalLogger(isProduction bool) {
	GlobalLogger = NewLogger(isProduction)
}
