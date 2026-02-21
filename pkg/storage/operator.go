package storage

import (
	"context"
)

// DataOperator defines a generic interface for data storage operations,
// abstracting away the underlying database driver (MongoDB, SQL, etc.).
type DataOperator interface {
	// FindOne retrieves a single document matching the filter.
	FindOne(ctx context.Context, collection string, filter interface{}, result interface{}) error

	// FindMany retrieves multiple documents matching the filter.
	// Returns a slice of results or an error.
	FindMany(ctx context.Context, collection string, filter interface{}, results interface{}) error

	// Insert adds a new document to the specified collection.
	Insert(ctx context.Context, collection string, document interface{}) (interface{}, error)

	// Update updates documents matching the filter with the provided update data.
	Update(ctx context.Context, collection string, filter interface{}, update interface{}) (int64, error)

	// Delete removes documents matching the filter.
	Delete(ctx context.Context, collection string, filter interface{}) (int64, error)

	// Count returns the number of documents matching the filter.
	Count(ctx context.Context, collection string, filter interface{}) (int64, error)

	// EnsureIndex ensures an index exists on the specified collection.
	EnsureIndex(ctx context.Context, collection string, index interface{}) error

	// Close closes the underlying connection.
	Close(ctx context.Context) error
}
