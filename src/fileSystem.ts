
import "./context.js";

import * as fs from "fs";
import * as os from "os";
import * as pathUtils from "path";
import { PackageConfig } from "./package.js";

const rootDirPath = pathUtils.parse(process.cwd()).root;

export const splitRelPath = (path: string): string[] => {
    const normPath = pathUtils.normalize(path);
    // Be careful of trailing separators.
    return normPath.split(pathUtils.sep).filter((part) => (part.length > 0));
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
    
    createMissingDirs(path: string): void {
        const relPath = this.getRelativePath(rootDirPath, path);
        if (relPath === "") {
            return;
        }
        const pathParts = splitRelPath(relPath);
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
    
    addChild(entity: VirtualEntity): void {
        if (this.children.some((child) => (child.name === entity.name))) {
            throw new Error(`An entity with the name "${entity.name}" already exists.`);
        }
        this.children.push(entity);
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
    
    entityExists(path: string): boolean {
        throw new Error("Not yet implemented");
    }
    
    entityIsDirectory(path: string): boolean {
        throw new Error("Not yet implemented");
    }
    
    readFile(path: string): Buffer {
        throw new Error("Not yet implemented");
    }
    
    writeFile(path: string, buffer: Buffer): void {
        throw new Error("Not yet implemented");
    }
    
    deleteFile(path: string): void {
        throw new Error("Not yet implemented");
    }
    
    readDirectory(path: string): string[] {
        throw new Error("Not yet implemented");
    }
    
    createDirectory(path: string): void {
        throw new Error("Not yet implemented");
    }
    
    deleteDirectory(path: string): void {
        throw new Error("Not yet implemented");
    }
    
    getHomeDirectory(): string {
        throw new Error("Not yet implemented");
    }
    
    getAbsolutePath(path: string): string {
        throw new Error("Not yet implemented");
    }
    
    getRelativePath(refPath: string, targetPath: string): string {
        throw new Error("Not yet implemented");
    }
}


