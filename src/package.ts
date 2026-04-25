
import "./moduleParser.js";

import * as fs from "fs";
import * as pathUtils from "path";
import { PetSymbol } from "./symbol.js";
import { PetString } from "./value.js";

export class PetPackage {
    specifier: PetString | PetSymbol;
    
    constructor(specifier: PetString | PetSymbol) {
        this.specifier = specifier;
    }
}

// Stored in petroleumPackage.json.
interface UserPackageConfig {
    specifier: string;
    version: string;
    mainModule: string;
    dependencies: {
        specifier: string,
        version: string,
    }[];
}

export class UserPackage extends PetPackage {
    version: string;
    // `path` and `mainModulePath` are absolute paths.
    path: string;
    mainModulePath: string;
    
    constructor(path: string) {
        const absPath = pathUtils.resolve(path);
        const configPath = pathUtils.join(absPath, "petroleumPackage.json");
        const config: UserPackageConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
        const mainModulePath = pathUtils.normalize(pathUtils.join(absPath, config.mainModule));
        super(new PetString(config.specifier));
        this.version = config.version;
        this.path = absPath;
        this.mainModulePath = mainModulePath;
    }
}


