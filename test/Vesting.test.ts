import { ethers, waffle } from "hardhat";
import { use, expect } from "chai";
import { TestToken, Vesting } from "../typechain";
import { setupUsers } from "./utils";
import { BigNumber } from "ethers";
use(waffle.solidity);

type User = { address: string } & { token: TestToken; vesting: Vesting };

describe("Vesting.sol", async () => {
    let users: User[],
        owner: User,
        admin: User,
        user1: User,
        user2: User,
        user3: User,
        user4: User,
        user5: User,
        user6: User,
        token: TestToken,
        vesting: Vesting;
    beforeEach(async () => {
        const signers = await ethers.getSigners();
        // TOKEN
        const tokenFactory = await ethers.getContractFactory("TestToken");
        token = (await (await tokenFactory.deploy()).deployed()) as TestToken;
        // VESTING
        const vestingFactory = await ethers.getContractFactory("Vesting");
        vesting = (await (
            await vestingFactory.deploy(token.address)
        ).deployed()) as Vesting;
        // USERS
        const addresses = await Promise.all(signers.map(async (signer) => signer.getAddress()));
        users = await setupUsers(addresses, { token, vesting });
        owner = users[0];
        admin = users[1];
        user1 = users[2];
        user2 = users[3];
        user3 = users[4];
        user4 = users[5];
        user5 = users[6];
        user6 = users[7];
        await (await owner.vesting.setAdmin(admin.address, true)).wait();
        // TOKEN BALANCE
        const amount = ethers.utils.parseEther("10000");
        await (await owner.token.transfer(admin.address, amount)).wait();
    });
    it("should have correct token address", async () => {
        const tokenAddress = await users[0].vesting.tokenAddress();
        expect(tokenAddress).to.be.equal(token.address);
    });
    describe("Access Tests", async () => {
        it("owner should be able to set admin", async () => {
            const newAdmin = users[2];
            await expect(owner.vesting.setAdmin(newAdmin.address, true)).to.emit(vesting, "AdminAccessSet");
            const isAdmin = await owner.vesting.isAdmin(newAdmin.address);
            expect(isAdmin).to.be.equal(true);
        });
        it("owner should be able to revoke admin", async () => {
            await expect(owner.vesting.setAdmin(admin.address, false)).to.emit(vesting, "AdminAccessSet");
            const isAdmin = await owner.vesting.isAdmin(admin.address);
            expect(isAdmin).to.be.equal(false);
        });
        it("admin should not be able to set admin", async () => {
            const newAdmin = users[2];
            await expect(admin.vesting.setAdmin(newAdmin.address, true)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });
        it("user should not be able to set admin", async () => {
            const user = users[2];
            const newAdmin = users[3];
            await expect(user.vesting.setAdmin(newAdmin.address, true)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });
        it("owner should be able to withdraw tokens from contract", async () => {
            const wallet = users[2];
            const amount = BigNumber.from(ethers.utils.parseEther("100"));
            const walletBalance = BigNumber.from(await token.balanceOf(wallet.address));
            // Transfer funds to contract
            await owner.token.transfer(vesting.address, amount);
            // Withdraw
            await (await owner.vesting.withdrawTokens(wallet.address)).wait();
            const walletBalance_new = BigNumber.from(await token.balanceOf(wallet.address));
            const contractBalance_new = BigNumber.from(await token.balanceOf(vesting.address));

            expect(walletBalance_new).to.be.equal(walletBalance.add(amount));
            expect(contractBalance_new).to.be.equal(0);
        });
    });
    describe("Vesting", async () => {
        it("admin should be able to create a claim", async () => {
            const beneficiary = users[2];
            const amount = ethers.utils.parseEther("1000");
            const inUnlockAmount = 0;
            const startTime = Date.now();
            const cliffTime = 60;
            const endTime = Date.now() + 60 * 1000;
            await admin.token.approve(vesting.address, amount);
            await expect(
                admin.vesting.createClaim(
                    beneficiary.address,
                    amount,
                    startTime,
                    cliffTime,
                    endTime,
                    inUnlockAmount
                )
            ).to.emit(vesting, "ClaimCreated");
            const claim = await vesting.getClaim(beneficiary.address);
            expect(claim.totalAmount).to.be.equal(amount);
            expect(claim.startTime).to.be.equal(startTime);
            expect(claim.endTime).to.be.equal(endTime);
            expect(claim.amountClaimed).to.be.equal(0);
        });
        it("admin should be able to create a batch of claims", async () => {
            const iterations = 5;
            const beneficiaries = [];
            const amount = ethers.utils.parseEther("1000");
            const amounts = [];
            var vestAmount: BigNumber = BigNumber.from("0");
            const inUnlockAmount = 0;
            const startTime = Date.now();
            const cliffTime = 60;
            const endTime = Date.now() + 60 * 1000;
            for (var i = 0; i < iterations; i++) {
                beneficiaries.push(users[i].address);
                amounts.push(amount);
                vestAmount = amount.add(vestAmount);
            }
            await await admin.token.approve(vesting.address, vestAmount);
            await (
                await admin.vesting.createBatchClaim(
                    beneficiaries,
                    amounts,
                    startTime,
                    cliffTime,
                    endTime,
                    inUnlockAmount
                )
            ).wait();
            for (var i = 0; i < iterations; i++) {
                const claim = await vesting.getClaim(beneficiaries[i]);
                expect(claim.totalAmount).to.be.equal(amounts[i]);
                expect(claim.startTime).to.be.equal(startTime);
                expect(claim.endTime).to.be.equal(endTime);
                expect(claim.amountClaimed).to.be.equal(0);
            }
        });
        it("non-admin should not be able to create a claim", async () => {
            const user = users[2];
            const beneficiary = users[3];
            const amount = ethers.utils.parseEther("1000");
            const unlockTime = 0;
            const unlockAmount = 0;
            const startTime = Date.now();
            const endTime = Date.now() + 60 * 1000;
            await expect(
                user.vesting.createClaim(
                    beneficiary.address,
                    amount,
                    unlockAmount,
                    unlockTime,
                    startTime,
                    endTime
                )
            ).to.be.revertedWith("Caller does not have Admin Access");
        });
        it("beneficiary should be able to claim", async () => {
            const beneficiary = users[2];
            const amount = BigNumber.from(ethers.utils.parseEther("1000"));
            const unlockTime = 0;
            const unlockAmount = 0;
            const startTime = Date.now();
            const endTime = Date.now() + 1 * 1000;
            await await admin.token.approve(vesting.address, amount);
            await expect(
                admin.vesting.createClaim(
                    beneficiary.address,
                    amount,
                    unlockAmount,
                    unlockTime,
                    startTime,
                    endTime
                )
            ).to.emit(vesting, "ClaimCreated");

            // FOR UPDATING BLOCK
            await ethers.provider.send("evm_setNextBlockTimestamp", [endTime]);
            await ethers.provider.send("evm_mine", []);

            const beneficiary_balance = BigNumber.from(await token.balanceOf(beneficiary.address));
            await (await beneficiary.vesting.claim()).wait();
            const beneficiary_balance_new = BigNumber.from(await token.balanceOf(beneficiary.address));
            expect(beneficiary_balance_new).to.be.equal(beneficiary_balance.add(amount));
        });
        it("should have correct claimable amounts", async () => {
            const beneficiary = users[2];
            const amount = BigNumber.from(ethers.utils.parseEther("1000"));
            const cliffTime = 0;
            const unlockAmount = 0;
            const currentBlock = await ethers.provider.getBlockNumber();
            const startTime = await (await ethers.provider.getBlock(currentBlock)).timestamp;
            const endTime = startTime + 1000;
            await await admin.token.approve(vesting.address, amount);
            await expect(
                admin.vesting.createClaim(
                    beneficiary.address,
                    amount,
                    startTime,
                    cliffTime,
                    endTime,
                    unlockAmount
                )
            ).to.emit(vesting, "ClaimCreated");

            var nextTimeStamp = startTime;
            var claimable = BigNumber.from(0);
            for (var i = 0; i < 10; i++) {
                nextTimeStamp += 100;
                claimable = claimable.add(ethers.utils.parseEther("100"));

                // FOR UPDATING BLOCK
                await ethers.provider.send("evm_setNextBlockTimestamp", [nextTimeStamp]);
                await ethers.provider.send("evm_mine", []);

                const claimableAmount = await beneficiary.vesting.claimableAmount(beneficiary.address);

                expect(claimableAmount).to.be.equal(claimable);
            }
        });
        it("Admin should be able to revoke Vesting", async () => {
            const beneficiary = users[3];
            const amount = BigNumber.from(ethers.utils.parseEther("1000"));
            const cliffTime = 0;
            const unlockAmount = 0;
            const currentBlock = await ethers.provider.getBlockNumber();
            const startTime = await (await ethers.provider.getBlock(currentBlock)).timestamp;
            const endTime = startTime + 1000;
            await await admin.token.approve(vesting.address, amount);
            await expect(
                admin.vesting.createClaim(
                    beneficiary.address,
                    amount,
                    startTime,
                    cliffTime,
                    endTime,
                    unlockAmount
                )
            ).to.emit(vesting, "ClaimCreated");

            await expect(admin.vesting.revoke(beneficiary.address)).to.emit(
                vesting,
                "Revoked"
            );
        });
        it("Non-Admin should not be able to revoke Vesting", async () => {
            const beneficiary = users[5];
            const amount = BigNumber.from(ethers.utils.parseEther("1000"));
            const cliffTime = 0;
            const unlockAmount = 0;
            const currentBlock = await ethers.provider.getBlockNumber();
            const startTime = await (await ethers.provider.getBlock(currentBlock)).timestamp;
            const endTime = startTime + 1000;
            await await admin.token.approve(vesting.address, amount);
            await expect(
                admin.vesting.createClaim(
                    beneficiary.address,
                    amount,
                    startTime,
                    cliffTime,
                    endTime,
                    unlockAmount
                )
            ).to.emit(vesting, "ClaimCreated");
            
            await expect(users[4].vesting.revoke(beneficiary.address)).to.be.revertedWith(
                "Caller does not have Admin Access"
            );
        });
    });
});
