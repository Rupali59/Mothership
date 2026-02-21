package storage

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// MongoOperator is a MongoDB implementation of the DataOperator interface.
type MongoOperator struct {
	client   *mongo.Client
	database *mongo.Database
}

// NewMongoOperator creates a new MongoOperator instance.
func NewMongoOperator(ctx context.Context, uri, dbName string) (*MongoOperator, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to mongodb: %w", err)
	}

	if err := client.Ping(ctx, nil); err != nil {
		return nil, fmt.Errorf("failed to ping mongodb: %w", err)
	}

	return &MongoOperator{
		client:   client,
		database: client.Database(dbName),
	}, nil
}

func (m *MongoOperator) FindOne(ctx context.Context, collection string, filter interface{}, result interface{}) error {
	return m.database.Collection(collection).FindOne(ctx, filter).Decode(result)
}

func (m *MongoOperator) FindMany(ctx context.Context, collection string, filter interface{}, results interface{}) error {
	cursor, err := m.database.Collection(collection).Find(ctx, filter)
	if err != nil {
		return err
	}
	return cursor.All(ctx, results)
}

func (m *MongoOperator) Insert(ctx context.Context, collection string, document interface{}) (interface{}, error) {
	res, err := m.database.Collection(collection).InsertOne(ctx, document)
	if err != nil {
		return nil, err
	}
	return res.InsertedID, nil
}

func (m *MongoOperator) Update(ctx context.Context, collection string, filter interface{}, update interface{}) (int64, error) {
	res, err := m.database.Collection(collection).UpdateMany(ctx, filter, update)
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

// Delete removes documents matching the filter.
func (m *MongoOperator) Delete(ctx context.Context, collection string, filter interface{}) (int64, error) {
	result, err := m.database.Collection(collection).DeleteMany(ctx, filter)
	if err != nil {
		return 0, err
	}
	return result.DeletedCount, nil
}

// Count returns the number of documents matching the filter.
func (m *MongoOperator) Count(ctx context.Context, collection string, filter interface{}) (int64, error) {
	return m.database.Collection(collection).CountDocuments(ctx, filter)
}

// EnsureIndex ensures an index exists on the specified collection.
func (m *MongoOperator) EnsureIndex(ctx context.Context, collection string, index interface{}) error {
	idx, ok := index.(mongo.IndexModel)
	if !ok {
		return fmt.Errorf("invalid index model: expected mongo.IndexModel")
	}
	_, err := m.database.Collection(collection).Indexes().CreateOne(ctx, idx)
	return err
}

func (m *MongoOperator) Close(ctx context.Context) error {
	if m.client != nil {
		return m.client.Disconnect(ctx)
	}
	return nil
}
