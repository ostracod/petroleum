
import "./context.js";

import * as fs from "fs";
import * as os from "os";
import * as pathUtils from "path";
import { PackageConfig } from "./package.js";

const rootDirPath = pathUtils.parse(process.cwd()).root;

const splitRelPath = (path: string): string[] => {
    const normPath = pathUtils.normalize(path);
    // Be careful of trailing separators.
    return normPath.split(pathUtils.sep).filter((part) => (part.length > 0));
};

export const getPathParent = (inputPath: string): string | null => {
    const path = pathUtils.normalize(inputPath);
    const dirname = pathUtils.dirname(path);
    if (pathUtils.isAbsolute(path)) {
        return (path === dirname) ? null : dirname;
    } else {
        const pathParts = splitRelPath(path);
        if (pathParts.length === 1 && pathParts[0] === ".") {
            return "..";
        } else if (pathParts.every((part) => (part === ".."))) {
            return pathUtils.join("..", path);
        } else {
            return dirname;
        }
    }
};

export abstract class FileSystem {
    
    abstract entityExists(path: string): boolean;
    
    abstract entityIsDirectory(path: string): boolean;
    
    abstract readFile(path: string): Buffer;
    
    abstract writeFile(path: string, buffer: Buffer): void;
    
    abstract deleteFile(path: string): void;
    
    abstract readDirectory(path: string): string[];
    
    abstract createDirectory(path: string): void;
    
    abstract deleteDirectory(path: string): void;
    
    abstract getHomeDirectory(): string;
    
    abstract getAbsolutePath(path: string): string;
    
    abstract getRelativePath(refPath: string, targetPath: string): string;
    
    splitPath(path: string): string[] {
        const relPath = this.getRelativePath(rootDirPath, path);
        return (relPath === "") ? [] : splitRelPath(relPath);
    }
    
    createMissingDirs(path: string): void {
        const pathParts = this.splitPath(path);
        for (let index = 1; index <= pathParts.length; index++) {
            const absPath = pathUtils.join(rootDirPath, ...pathParts.slice(0, index));
            if (!this.entityExists(absPath)) {
                this.createDirectory(absPath);
            }
        }
    }
}

export class HostFileSystem extends FileSystem {
    
    entityExists(path: string): boolean {
        return fs.existsSync(path);
    }
    
    entityIsDirectory(path: string): boolean {
        return fs.statSync(path).isDirectory();
    }
    
    readFile(path: string): Buffer {
        return fs.readFileSync(path);
    }
    
    writeFile(path: string, buffer: Buffer): void {
        fs.writeFileSync(path, buffer);
    }
    
    deleteFile(path: string): void {
        fs.unlinkSync(path);
    }
    
    readDirectory(path: string): string[] {
        return fs.readdirSync(path);
    }
    
    createDirectory(path: string): void {
        fs.mkdirSync(path);
    }
    
    deleteDirectory(path: string): void {
        fs.rmSync(path, { recursive: true });
    }
    
    getHomeDirectory(): string {
        return pathUtils.resolve(os.homedir());
    }
    
    getAbsolutePath(path: string): string {
        return pathUtils.resolve(path);
    }
    
    getRelativePath(refPath: string, targetPath: string): string {
        return pathUtils.relative(refPath, targetPath);
    }
}

class VirtualEntity {
    name: string;
    
    constructor(name: string) {
        this.name = name;
    }
}

class VirtualFile extends VirtualEntity {
    buffer: Buffer;
    
    constructor(name: string, buffer: Buffer) {
        super(name);
        this.buffer = buffer;
    }
}

class VirtualDirectory extends VirtualEntity {
    children: VirtualEntity[];
    
    constructor(name: string) {
        super(name);
        this.children = [];
    }
    
    findChild(name: string): { child: VirtualEntity, index: number } | null {
        const index = this.children.findIndex((child) => (child.name === name));
        return (index < 0) ? null : { child: this.children[index], index };
    }
    
    getChild(name: string): VirtualEntity | null {
        const result = this.findChild(name);
        return (result === null) ? null : result.child;
    }
    
    // Before calling addChild, make sure no other child exists with the same name.
    addChild(entity: VirtualEntity): void {
        this.children.push(entity);
    }
    
    deleteChild(index: number): void {
        this.children.splice(index, 1);
    }
}

const targetPackageConfig: PackageConfig = {
    specifier: "ostracod.targetPackage",
    version: "1.0.0",
    mainModule: "./main.petrol",
    petroleumVersion: "^1.0.0",
    dependencies: [],
};

export class VirtualFileSystem extends FileSystem {
    rootDirectory: VirtualDirectory;
    homePath: string;
    currentWorkingDirPath: string;
    
    constructor() {
        super();
        this.rootDirectory = new VirtualDirectory("");
        this.homePath = pathUtils.join(rootDirPath, "home", "testUser");
        this.createMissingDirs(this.homePath);
        const packageStorePath = pathUtils.join(this.homePath, "petroleumPackages");
        this.createDirectory(packageStorePath);
        const targetPackagePath = pathUtils.join(this.homePath, "targetPackage");
        this.createDirectory(targetPackagePath);
        this.currentWorkingDirPath = targetPackagePath;
        const packageConfigPath = pathUtils.join(targetPackagePath, "petroleumPackage.json");
        const packageConfigBuffer = Buffer.from(JSON.stringify(targetPackageConfig));
        this.writeFile(packageConfigPath, packageConfigBuffer);
    }
    
    getOptionalEntity(path: string): VirtualEntity | null {
        const pathParts = this.splitPath(path);
        let entity: VirtualEntity = this.rootDirectory;
        for (const name of pathParts) {
            if (!(entity instanceof VirtualDirectory)) {
                return null;
            }
            const nextEntity = entity.getChild(name);
            if (nextEntity === null) {
                return null;
            }
            entity = nextEntity;
        }
        return entity;
    }
    
    getEntity(path: string): VirtualEntity {
        const result = this.getOptionalEntity(path);
        if (result === null) {
            throw new Error(`File system entity at path ${path} is missing.`);
        }
        return result;
    }
    
    entityExists(path: string): boolean {
        return (this.getOptionalEntity(path) !== null);
    }
    
    entityIsDirectory(path: string): boolean {
        return (this.getEntity(path) instanceof VirtualDirectory);
    }
    
    getParentDir(path: string): VirtualDirectory {
        const parentPath = getPathParent(path);
        if (parentPath === null) {
            throw new Error(`Path ${path} has no parent directory.`);
        }
        const entity = this.getEntity(parentPath);
        if (!(entity instanceof VirtualDirectory)) {
            throw new Error(`Expected directory at ${parentPath}, but found file.`);
        }
        return entity;
    }
    
    getNameAndDir(path: string): { name: string, parentDir: VirtualDirectory } {
        const name = pathUtils.basename(path);
        const parentDir = this.getParentDir(path);
        return { name, parentDir };
    }
    
    readFile(path: string): Buffer {
        const entity = this.getOptionalEntity(path);
        if (entity instanceof VirtualFile) {
            return entity.buffer;
        } else {
            throw new Error(`File is missing at ${path}.`);
        }
    }
    
    writeFile(path: string, buffer: Buffer): void {
        const entity = this.getOptionalEntity(path);
        if (entity === null) {
            const { name, parentDir } = this.getNameAndDir(path);
            const file = new VirtualFile(name, buffer);
            parentDir.addChild(file);
        } else if (entity instanceof VirtualFile) {
            entity.buffer = buffer;
        } else {
            throw new Error(`Trying to write file at ${path}, but a directory exists at that path.`);
        }
    }
    
    deleteHelper<T>(
        path: string,
        classConstructor: abstract new (...args: any[]) => T,
        errorMessage: string,
    ): void {
        const { name, parentDir } = this.getNameAndDir(path);
        const result = parentDir.findChild(name);
        if (result === null) {
            throw new Error(`No file system entity exists at ${path}.`);
        }
        const { child, index } = result;
        if (!(child instanceof classConstructor)) {
            throw new Error(errorMessage);
        }
        parentDir.deleteChild(index);
    }
    
    deleteFile(path: string): void {
        this.deleteHelper(
            path, VirtualFile,
            `Expected file at ${path}, but found directory.`,
        );
    }
    
    readDirectory(path: string): string[] {
        const entity = this.getEntity(path);
        if (!(entity instanceof VirtualDirectory)) {
            throw new Error(`Expected directory at ${path}.`);
        }
        return entity.children.map((child) => child.name);
    }
    
    createDirectory(path: string): void {
        if (this.entityExists(path)) {
            throw new Error(`File system entity already exists at ${path}.`);
        }
        const { name, parentDir } = this.getNameAndDir(path);
        const directory = new VirtualDirectory(name);
        parentDir.addChild(directory);
    }
    
    deleteDirectory(path: string): void {
        this.deleteHelper(
            path, VirtualDirectory,
            `Expected directory at ${path}, but found file.`,
        );
    }
    
    getHomeDirectory(): string {
        return this.homePath;
    }
    
    getAbsolutePath(path: string): string {
        const abnormalPath = pathUtils.isAbsolute(path)
            ? path
            : pathUtils.join(this.currentWorkingDirPath, path);
        return pathUtils.normalize(abnormalPath);
    }
    
    getRelativePath(refPath: string, targetPath: string): string {
        if (pathUtils.isAbsolute(refPath) === pathUtils.isAbsolute(targetPath)) {
            return pathUtils.relative(refPath, targetPath);
        }
        const absRefPath = this.getAbsolutePath(refPath);
        const absTargetPath = this.getAbsolutePath(targetPath);
        return pathUtils.relative(absRefPath, absTargetPath);
    }
}


