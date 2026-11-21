package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/internal/backup"
	"github.com/QuantumNous/new-api/model"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "newapi-backup:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		printUsage(os.Stderr)
		return errors.New("a command is required")
	}
	switch args[0] {
	case "backup":
		return runBackup(args[1:])
	case "verify":
		return runVerify(args[1:])
	case "inspect":
		return runInspect(args[1:])
	case "schema-check":
		return runSchemaCheck(args[1:])
	case "restore":
		return runRestore(args[1:])
	default:
		printUsage(os.Stderr)
		return fmt.Errorf("unknown command %q", args[0])
	}
}

func runBackup(args []string) error {
	flags := flag.NewFlagSet("backup", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	dsn := flags.String("dsn", os.Getenv("SQL_DSN"), "source database DSN")
	output := flags.String("output", "new-api-backup.nab", "output backup path")
	passwordEnv := flags.String("password-env", "NEW_API_BACKUP_PASSWORD", "environment variable containing the backup password")
	passwordStdin := flags.Bool("password-stdin", false, "read the backup password from stdin")
	version := flags.String("version", common.Version, "application version recorded in the manifest")
	if err := flags.Parse(args); err != nil {
		return err
	}
	password, err := readPassword(*passwordEnv, *passwordStdin)
	if err != nil {
		return err
	}
	db, dbType, err := model.OpenDatabaseForBackup(*dsn)
	if err != nil {
		return err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	result, err := backup.Export(context.Background(), db, dbType, *version, *output, password)
	if err != nil {
		return err
	}
	return printJSON(result)
}

func runVerify(args []string) error {
	flags := flag.NewFlagSet("verify", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	input := flags.String("input", "", "backup path")
	passwordEnv := flags.String("password-env", "NEW_API_BACKUP_PASSWORD", "environment variable containing the backup password")
	passwordStdin := flags.Bool("password-stdin", false, "read the backup password from stdin")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *input == "" {
		return errors.New("-input is required")
	}
	password, err := readPassword(*passwordEnv, *passwordStdin)
	if err != nil {
		return err
	}
	manifest, err := backup.Verify(context.Background(), *input, password)
	if err != nil {
		return err
	}
	return printJSON(manifest)
}

func runInspect(args []string) error {
	flags := flag.NewFlagSet("inspect", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	input := flags.String("input", "", "backup path")
	passwordEnv := flags.String("password-env", "NEW_API_BACKUP_PASSWORD", "environment variable containing the backup password")
	passwordStdin := flags.Bool("password-stdin", false, "read the backup password from stdin")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *input == "" {
		return errors.New("-input is required")
	}
	password, err := readPassword(*passwordEnv, *passwordStdin)
	if err != nil {
		return err
	}
	manifest, err := backup.Inspect(context.Background(), *input, password)
	if err != nil {
		return err
	}
	return printJSON(manifest)
}

func runSchemaCheck(args []string) error {
	flags := flag.NewFlagSet("schema-check", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	dsn := flags.String("dsn", os.Getenv("SQL_DSN"), "database DSN")
	if err := flags.Parse(args); err != nil {
		return err
	}
	db, _, err := model.OpenDatabaseForBackup(*dsn)
	if err != nil {
		return err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	result, err := backup.CheckSchema(db)
	if err != nil {
		return err
	}
	return printJSON(result)
}

func runRestore(args []string) error {
	flags := flag.NewFlagSet("restore", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	input := flags.String("input", "", "backup path")
	dsn := flags.String("dsn", "", "empty target database DSN")
	passwordEnv := flags.String("password-env", "NEW_API_BACKUP_PASSWORD", "environment variable containing the backup password")
	passwordStdin := flags.Bool("password-stdin", false, "read the backup password from stdin")
	version := flags.String("version", common.Version, "target application version")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *input == "" {
		return errors.New("-input is required")
	}
	if strings.TrimSpace(*dsn) == "" {
		return errors.New("-dsn is required for restore")
	}
	password, err := readPassword(*passwordEnv, *passwordStdin)
	if err != nil {
		return err
	}
	result, err := backup.Restore(context.Background(), *input, password, *dsn, *version)
	if err != nil {
		return err
	}
	return printJSON(result)
}

func readPassword(environment string, fromStdin bool) (string, error) {
	if fromStdin {
		data, err := io.ReadAll(io.LimitReader(os.Stdin, 4096))
		if err != nil {
			return "", err
		}
		password := strings.TrimSpace(string(data))
		if password == "" {
			return "", errors.New("backup password from stdin is empty")
		}
		return password, nil
	}
	if environment == "" {
		return "", errors.New("-password-env or -password-stdin is required")
	}
	password := os.Getenv(environment)
	if password == "" {
		return "", fmt.Errorf("backup password environment variable %s is empty", environment)
	}
	return password, nil
}

func printJSON(value any) error {
	data, err := common.Marshal(value)
	if err != nil {
		return err
	}
	_, err = fmt.Println(string(data))
	return err
}

func printUsage(writer io.Writer) {
	_, _ = fmt.Fprintln(writer, "usage: newapi-backup <backup|verify|inspect|schema-check|restore> [flags]")
	_, _ = fmt.Fprintln(writer, "passwords are read from NEW_API_BACKUP_PASSWORD or --password-stdin")
}
