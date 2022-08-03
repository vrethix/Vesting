import { ethers, run } from "hardhat";

async function deploy() {
    const Vesting = await ethers.getContractFactory("Vesting");
    const vesting = await Vesting.deploy("Enter Token Address");
    await vesting.deployed();
    console.log("Vesting Token deployed at", vesting.address);

    function delay(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    await delay(10000);

    /**
     * Programmatic verification
     */
    try {
        await run("verify:verify", {
            address: vesting.address,
            contract: "contracts/s.sol:Vesting",
            constructorArguments: ["Enter Token Address"],
        });
    } catch (e: any) {
        console.error(`error in verifying: ${e.message}`);
    }
}

deploy();
