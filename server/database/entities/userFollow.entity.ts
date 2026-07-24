import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** 用户关注关系：follower 关注 followee（独立表）。 */
@Entity({ name: 'user_follows' })
@Index('uq_user_follows_follower_followee', ['followerId', 'followeeId'], { unique: true })
@Index('idx_user_follows_followee', ['followeeId'])
@Index('idx_user_follows_follower', ['followerId'])
export class UserFollow {
  @PrimaryGeneratedColumn('increment', { type: 'integer', primaryKeyConstraintName: 'pk_user_follows' })
  id!: number

  @Column({ name: 'follower_id', type: 'integer', nullable: false })
  followerId!: number

  @Column({ name: 'followee_id', type: 'integer', nullable: false })
  followeeId!: number

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date
}
